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
        settings.hideScrollbars = true;

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
            if (ex.code !== "EEXIST")
                help(ex.message);
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
            resolve(settings);
            return;
        }

        var searchUrl = "https://duckduckgo.com/?q=" + urlBefore
        + "&format=json";
        request(searchUrl, function (error, response, body) {
            if (error || response.statusCode != 200)
                error("Could not resolve unqualified URI " + urlBefore);

            var json = JSON.parse(body);
            try {
                settings.url = json.Results[0].FirstURL;
                if (!vurl.isWebUri(settings.url))
                    error("Could not resolve unqualified URI " + urlBefore);
                resolve(settings);
            } catch (err) {
                error("Could not resolve unqualified URI " + urlBefore);
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
        favicon(settings.url, function(err, data) {
            if (err != undefined)
              error(err);
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
                var stream = response.pipe(file);
                stream.on("finish", function () {
                    resolve(settings);
                });
            });
        request.setTimeout( 10000, function( ) {
            error("Request to download favicon timed out!!");
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
            error("No built-in resize backend for this platform " +
                "present. Will try to use default.");
        }

        var opts = [settings.favicoIn, settings.favicoOut ];
        child_process.execFile(convert, opts, function(err, stdout, stderr) {
            if (err) {
                error("Could not generate pgn. Will skip this step. "
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

        if (!fileExists(settings.favicoOut)) {
            error("Favicon PNG does not exist. Will use default icon.");
            settings.favicoOut = path.join(__dirname, "favicon-default.png");
        }

        // append internal window settings
        settings.windowSettings.icon = settings.favicoOut;
        settings.windowSettings.webPreferences = {
                nodeIntegration: false
            };
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
            splash.destroy();
            if (settings.maximized)
                bw.maximize();
            resolve(bw);
        });
    });
};

var injectCss = function ( settings, bw ) {
    return new Promise(function(resolve, reject) {

        if (settings.hideScrollbars === true )
            bw.webContents.insertCSS ("body { overflow:hidden !important; }");

        if (settings.cssFile == undefined) {
            resolve(bw);
            return;
        }
        fs.readFile(settings.cssFile, "utf8", function (err,data) {
            if (err) {
                error("Could not read provided CSS file. Ignoring.", err);
                resolve(bw);
                return;
            }
            bw.webContents.insertCSS (data);

            resolve(bw);
        });
    });
};

var createDesktopLinks = function( settings ) {
    return new Promise(function(resolve, reject) {

        var urlObj = url.parse(settings.url);
        settings.settingsFile = path.join(__udataDirname, "electrify-" +
            urlObj.hostname + ".settings.txt");

        if (os.platform() === "win32") {

            var symlink = __dirname + "\\ext\\shortcut-windows.bat";
            var symlinkFile = path.join(__parentDirname,
            "Electrify " + urlObj.hostname + ".lnk");

            var opts = [
            "-linkfile",
            symlinkFile,
            "-target",
            __parentDirname +
            "\\node_modules\\electron-prebuilt\\dist\\electron.exe",
            "-workdir",
            __parentDirname,
            "-linkarguments",
            "electrify-me -r " + settings.settingsFile,
            "-description",
            "Electrify " + urlObj.hostname,
            "-iconlocation",
            settings.favicoIn
            ];

            child_process.execFile(symlink, opts,
            function(err, stdout, stderr) {
                if (err)
                    error("Could not generate symlink. ", err);
                resolve(settings);
            });

        } else if (os.platform() === "linux") {

            var iconPathAbs = settings.favicoIn;
            var command = path.join(__parentDirname,
                "node_modules", "electron-prebuilt", "dist",
                "electron") + " --enable-transparent-visuals --disable-gpu "
                + path.join(__parentDirname, "electrify-me") + " -r " +
                settings.settingsFile;

            var stream = fs.createWriteStream(
                path.join(__parentDirname,
                    settings.uriKey + ".desktop"));
                stream.once('open', function(fd) {
                stream.write("[Desktop Entry]\n");
                stream.write("Version=0.2.2\n");
                stream.write("Name=Electrify " + urlObj.hostname + "\n");
                stream.write("Comment=Electrified Version of "
                    + settings.url + "\n");
                stream.write("Exec=" + command + "\n");
                stream.write("Icon=" + iconPathAbs + "\n");
                stream.write("Terminal=false\n");
                stream.write("Type=Application\n");
                stream.write("Categories=Application;\n");
                stream.end();
                resolve(settings);
            });

        } else {
            error("No built-in symlink backend for this platform present.");
            resolve(settings);
        }
    });
};

var storeSettings = function (settings) {
    return new Promise(function(resolve, reject) {

        var sFile = settings.settingsFile;

        // delete internal settings
        delete settings.windowSettings.icon;
        delete settings.windowSettings.webPreferences;
        delete settings.windowSettings.show;
        delete settings.httpClient;
        delete settings.uriKey;
        delete settings.favicoIn;
        delete settings.favicoOut;
        delete settings.favicoBase;
        delete settings.settingsFile;

        fs.writeFile(sFile,
            JSON.stringify(settings, null, 2), "utf-8",
            function(err) {
                if (err)
                    error(err);
            }
        );

        resolve(settings);
    });
};


///////////////////////////////////////////////////////////////////////////////
// CORE CONTROLLER ////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

var startApplication = function(argv) {

    var settings = undefined;
    var splash = undefined;
    var chain = Promise.resolve();

    chain.then(function() {
        console.log("--- Electrify initialization started.\n");
        return readCmdLine(argv);
    }).then(function(data) {
        settings = data;
        console.log("Read command line.");
        return openSplash();
    }).then(function(data) {
        splash = data;
        console.log("Loaded splash screen.");
        return resolveToFullyQualifiedUrl(settings);
    }).then(function(data) {
        settings = data;
        console.log("Resolved input URL.");
        return getFaviconUrl(settings);
    }).then(function() {
        console.log("Received favicon url --> " + settings.faviconUrl);
        return getFavicon(settings);
    }).then(function() {
        console.log("Downloaded favicon --> " + settings.favicoIn);
        return convertFaviconToPng(settings);
    }).then(function() {
        console.log("Converted favicon --> " + settings.favicoOut);
        return selectBestFavicon(settings);
    }).then(function() {
        console.log("Selected best favicon --> " + settings.favicoOut);
        return setupWebcontent(settings, splash);
    }).then(function(browserWindow) {
        console.log("Finished application pre-processing.");
        return injectCss(settings, browserWindow);
    }).then(function(browserWindow) {
        browserWindow.show();
        console.log("Injected CSS.");
        return createDesktopLinks(settings);
    }).then(function(settings) {
        console.log("Created desktop links.");
        return storeSettings(settings);
    }).then(function() {
        console.log("Stored settings file.");
        console.log("\n--- Electrify initialization done.");
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

    // display of help always terminates the application.
    process.exit(0);
};

function error( message, exception, exit ) {
    if (message != undefined)
        console.log("[ERROR] " + message);
    if (exception != undefined)
        console.log("[ERROR] Exception was: " + exception);
    if (exit)
        process.exit(0);
}

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
