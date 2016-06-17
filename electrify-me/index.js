(function() {
"use-strict";

// Node-internal dependencies
const url = require("url");
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process = require("child_process");

// External dependencies
const favicon = require("favicon");
const minimist = require("minimist")
const request = require("request");
const vurl = require("valid-url");
const walk = require("walk");

// Electron dependencies
const electron = require("electron");
const app = electron.app;
const ipc = electron.ipcMain;

// Constants
const __parentDirname = path.resolve(__dirname, "..");
const __udataDirname = path.join(__parentDirname, "__electrified");

///////////////////////////////////////////////////////////////////////////////
// CORE INVOKATION FUNCTIONS //////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

var readCmdLine = function(argv) {
    return new Promise(function(resolve, reject) {

        var settings = {};

        if ( argv.h != undefined || argv.help != undefined)
            help();

        // try to read and evaluate settings file..
        var readSettingsFromFile = false;
        if (argv.r != undefined) {
            if (argv.r == "" || argv.r == true || argv.r == false) {
                help("Read-settings option used, but no filepath provided.");
            }
            try {
                settings = JSON.parse(fs.readFileSync(argv.r, "utf-8"));
                console.log("Read settings from file " + argv.r
                    + ". Content was:\n" + JSON.stringify(
                        settings, null, 2));
                console.log("For all possible window options refer to " +
                    "http://electron.atom.io/docs/api/browser-window/#class-" +
                    "browserwindow !! WARNING !! Parameters icon, show, and " +
                    "webPreferences will always be overwritten!");
            } catch (err) {
                help (err.message);
            }
            readSettingsFromFile = true;
        };

        // URL basic validation
        if (!readSettingsFromFile)
            settings.url = String(argv._);
        if (settings.url == undefined || settings.url == "" )
                help("No URL provided.");

        // set some internal settings
        settings.httpClient = vurl.isHttpUri(settings.url) ? "http" : "https";
        settings.uriKey = settings.url.replace(/[^a-zA-Z0-9]/g, "_");
        settings.favicoBase = __udataDirname + "/favicon_"
            + settings.uriKey;
        settings.favicoIn =  settings.favicoBase + ".ico";
        settings.favicoOut = settings.favicoBase + ".png";

        if (readSettingsFromFile) {
            // dont parse cmd line in this case
            resolve(settings);
            return;
        }

        // read optional input  files
        settings.cssFile = argv.c != undefined ? argv.c : undefined;
        if (settings.cssFile == "" || settings.cssFile == true ||
            settings.cssFile == false)
            help("CSS option used, but no filepath provided.");
        // read optional cmd toggles
        settings.devMode = argv.d != undefined ? true : false;
        settings.maximized = argv.m != undefined ? true : false;

        // default window settings
        settings.windowSettings = {
            fullscreen: false,
            fullscreenable: true,
            resizable: true,
            movable: true,
            frame: true,
        };

        // create user data dir
        try {
            fs.mkdirSync(__udataDirname);
        } catch (ex) {
            if (ex.code !== "EEXIST") {
                console.log(ex.message);
                help(ex.message);
            }
        }

        resolve(settings);
    });
};

var openSplash = function() {
    return new Promise(function(resolve, reject) {
        var splash = new electron.BrowserWindow({
            width: 120,
            height: 120,
            fullscreen: false,
            fullscreenable: false,
            resizable: false,
            movable: false,
            frame: false,
            transparent: true,
            show: false,
            webPreferences: {
                nodeIntegration: false
            },
        });
        splash.loadURL("file://" + __dirname + "/splash.html");
        splash.webContents.on("did-finish-load", function() {
            resolve(splash);
            splash.show();
        });
    });
};

var resolveToFullyQualifiedUrl = function(settings) {
    return new Promise(function(resolve, reject) {
        var urlBefore = settings.url;
        if (vurl.isWebUri(urlBefore)) {
            console.log("URI " + urlBefore + " already fully qualified.");
            resolve(settings);
            return;
        }

        var searchUrl = "https://duckduckgo.com/?q=" + urlBefore
        + "&format=json";
        request(searchUrl, function (error, response, body) {
            if (error || response.statusCode != 200)
                help("Could not resolve unqualified URI " + urlBefore);

            var json = JSON.parse(body);
            try {
                settings.url = json.Results[0].FirstURL;
                if (!vurl.isWebUri(settings.url))
                    help("Could not resolve unqualified URI " + urlBefore);
                console.log("Resolved " + urlBefore + " to " + settings.url);
                resolve(settings);
            } catch (err) {
                help("Could not resolve unqualified URI " + urlBefore);
            }
        });
    });
};

var getFaviconUrl = function (settings) {
    return new Promise(function(resolve, reject) {

        // skip on existing png icon file
        if (fileExists( settings.favicoOut )) {
            settings.faviconUrl = settings.favicoOut;
            resolve(settings);
            return;
        }
	    // console.log("Obtaining favicon for url " + settings.url);
        favicon(settings.url, function(err, data) {
            if (err != undefined) {
              reject();
              return;
          };
          settings.faviconUrl = data;
          resolve(settings);
      });
    });
};

var getFavicon = function (settings) {
    return new Promise(function(resolve, reject) {
        // skip on existing png icon file
        if (fileExists( settings.favicoOut )) {
            resolve();
            return;
        }
        var file = fs.createWriteStream(settings.favicoIn);
        var client = settings.httpClient == "http" ? http : https;
        var request = client.get(settings.faviconUrl,
            function(response, err) {
                if (err) {
                    console.log(err);
                }
                var stream = response.pipe(file);
                stream.on("finish", function () {
                    resolve(settings);
                });
            });
        request.setTimeout( 10000, function( ) {
            console.log("Request to download favicon timed out!!");
            resolve(settings);
        });
    });
};

var convertFaviconToPng = function (settings) {
    return new Promise(function(resolve, reject) {
        // skip on existing png icon file
        if (fileExists( settings.favicoOut )) {
            resolve();
            return;
        }

        var convert = "convert";
        if (os.platform() === "win32") {
            convert = __dirname + "/ext/imagemagick-windows/convert.exe";
        } else {
            console.log("No built-in resize backend for this platform " +
                "present. Will try to use default.");
        }

        var opts = [settings.favicoIn, settings.favicoOut ];
        child_process.execFile(convert, opts, function(err, stdout, stderr) {
            if (err) {
                console.log("Could not generate pgn. Will skip this step. "
                    + err.message);
                resolve(settings);
            }
            resolve(settings);
        });
    });
};

var selectBestFavicon = function (settings) {
    return new Promise(function(resolve, reject) {

        var maxSize = 0;
        var selectedFile = undefined;
        var candPatt = new RegExp("favicon_"
            + settings.uriKey + ".*\\.png$", "i");

        var walker = walk.walk(__udataDirname, {
            followLinks: false
        });
        walker.on("file", function(root, stat, next) {
            if (stat.name.match(candPatt)) {
                if (Number(stat.size) > maxSize) {
                    maxSize = Number(stat.size);
                    selectedFile = stat.name;
                }
            }
            next();
        });
        walker.on("end", function() {
	    if (selectedFile != undefined)
	            settings.favicoOut = path.join(__udataDirname, selectedFile);
            resolve(settings);
        });
    });
};

var setupWebcontent = function (settings, splash) {
    return new Promise(function(resolve, reject) {
        // append internal window settings
        settings.windowSettings.icon = settings.favicoOut;
        // settings.windowSettings.webPreferences = {
        //         nodeIntegration: false
        //     };
        settings.windowSettings.show = false;

        var bw = new electron.BrowserWindow(settings.windowSettings);
        bw.setMenu(null);  // disable default menu
        if (settings.devMode)
            bw.openDevTools({ detach: true });
        bw.loadURL(settings.url);
        bw.on("closed", function() {
            bw = null;
        });
        bw.webContents.on("did-finish-load", function() {
            console.log("All data loaded.");
            splash.destroy();
            if (settings.maximized)
                bw.maximize();
            bw.show();
            resolve(bw);
        });
    });
};

var injectCss = function ( settings, bw ) {
    return new Promise(function(resolve, reject) {
        if (settings.cssFile == undefined) {
            console.log("No css file provided.");
            resolve(settings, bw);
            return;
        } else {
            console.log("CSS provided at:\n\t" + settings.cssFile)
        }
        fs.readFile(settings.cssFile, "utf8", function (err,data) {
            if (err) {
                console.log(err);
                console.log("Could not read provided CSS file. Ignoring.");
                resolve(settings, bw);
                return;
            } else {
                //console.log("CSS data read:\n\t" + data);
            }
            bw.webContents.insertCSS (data);
            resolve();
        });
    });
};

var storeSettings = function (settings) {
    return new Promise(function(resolve, reject) {

        var urlObj = url.parse(settings.url);
        var pageName = urlObj.hostname.replace(/\.[^\.]+$/, "")
            .replace(/.*\./, "");
        pageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);
        var settingsFile = path.join(__udataDirname, "electrify-" +
            urlObj.hostname + ".settings.txt");

        if (os.platform() === "win32") {

            var symlink = __dirname + "\\ext\\shortcut-windows.bat";
            var symlinkFile = path.join(__parentDirname,
            "Electrify " + pageName + ".lnk");

            var opts = [
            "-linkfile",
            symlinkFile,
            "-target",
            __parentDirname +
            "\\node_modules\\electron-prebuilt\\dist\\electron.exe",
            "-workdir",
            __parentDirname,
            "-linkarguments",
            "electrify-me -r " + settingsFile,
            "-description",
            "Electrify " + pageName,
            "-iconlocation",
            settings.favicoIn
            ];


            child_process.execFile(symlink, opts,
            function(err, stdout, stderr) {
                if (err) {
                    console.log("Could not generate symlink. "
                        + err.message);
                }
            });

        } else if (os.platform() === "linux") {

            var iconPathAbs = settings.favicoIn;
            var command = path.join(__parentDirname,
                "node_modules", "electron-prebuilt", "dist",
                "electron") + " --enable-transparent-visuals --disable-gpu "
                + path.join(__parentDirname, "electrify-me") + " -r " +
                settingsFile;

            var stream = fs.createWriteStream(
                path.join(__parentDirname,
                    settings.uriKey + ".desktop"));
                stream.once('open', function(fd) {
                stream.write("[Desktop Entry]\n");
                stream.write("Version=0.2.1\n");
                stream.write("Name=Electrify " + pageName + "\n");
                stream.write("Comment=Electrified Version of "
                    + settings.url + "\n");
                stream.write("Exec=" + command + "\n");
                stream.write("Icon=" + iconPathAbs + "\n");
                stream.write("Terminal=false\n");
                stream.write("Type=Application\n");
                stream.write("Categories=Application;\n");
                stream.end();
            });

        } else {
            console.log("No built-in symlink backend for this platform " +
                "present.");
        }

        // delete internal settings
        delete settings.windowSettings.icon;
        delete settings.windowSettings.webPreferences;
        delete settings.windowSettings.show;
        delete settings.httpClient;
        delete settings.uriKey;
        delete settings.favicoIn;
        delete settings.favicoOut;
        delete settings.favicoBase;

        fs.writeFile(settingsFile,
            JSON.stringify(settings, null, 2), "utf-8",
            function(err) {
                console.log("Successfully written settings to "
                    + settingsFile);
            }
        );

        resolve(settings);
    });
};


///////////////////////////////////////////////////////////////////////////////
// CORE CONTROLLER ////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

var startApplication = function(argv, splash, settings) {

    readCmdLine(argv).then(function(data) {
        console.log("Read command line.");
        settings = data;
        return openSplash();
    }).then(function(data) {
        console.log("Splash screen loaded.");
        splash = data;
        return resolveToFullyQualifiedUrl(settings);
    }).then(function(data) {
        settings = data;
        return getFaviconUrl(settings);
    }).then(function() {
        console.log("Received favicon url:\n\t" + settings.faviconUrl);
        return getFavicon(settings);
    })
    .then(function() {
        console.log("Downloaded favicon to:\n\t" + settings.favicoIn);
        return convertFaviconToPng(settings);
    })
    .then(function() {
        console.log("Converted favicon to:\n\t" + settings.favicoOut);
        return selectBestFavicon(settings);
    })
    .then(function() {
        console.log("Selected best favicon:\n\t" + settings.favicoOut);
        return setupWebcontent(settings, splash);
    })
    .then(function(browserWindow) {
        console.log("Preprocessing done.");
        return injectCss(settings, browserWindow);
    })
    .then(function() {
        console.log("Finished startup sequence.");
        return storeSettings(settings);
    })
    .then(function() {
        console.log("Settings stored.");
    });
};

///////////////////////////////////////////////////////////////////////////////
// CORE EVENTS ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

app.on("window-all-closed", function() {
    if (process.platform != "darwin") {
        app.quit();
    }
});

app.on("ready", function() {
    const argv = minimist(process.argv.slice(2));
    startApplication(argv);
});

///////////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS ///////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function help( message ) {
    if (message != undefined)
        console.log(message);
    console.log("Usage:   <electrify> [URL] ([OPTS])");
    console.log("");
    console.log("Options: ");
    console.log("    -c <FILE>   CSS to be injected into website.");
    console.log("    -m          Window maximized.");
    console.log("    -d          Run in development mode.");
    console.log("    -r <FILE>   Read settings from local file "
        + "(all other options are ignored).");
    console.log("    -h          Print this help.");
    console.log("");
    console.log("Example: <electrify> https://web.whatsapp.com "
        + "-c inject.css -d");
    process.exit(0);
};

function fileExists ( filename ) {
    try {
        fs.accessSync(filename, fs.F_OK | fs.R_OK);
        var stat = fs.statSync(filename);
        if (stat["size"] == 0)
            return false;
        return true;
    } catch (err) {
        return false;
    }
};

})();
