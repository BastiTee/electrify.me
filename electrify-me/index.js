(function() {
"use-strict";

const vurl = require("valid-url");
const minimist = require("minimist")
const electron = require("electron");
const exec = require("child_process");
const walk = require("walk");
const url = require("url");
const http = require("http");
const https = require("https");
const favicon = require("favicon");
const fs = require("fs");
const path = require("path");
const os = require("os");
const app = electron.app;
const ipc = electron.ipcMain;
const __parentDirname = path.resolve(__dirname, "..");
const __udataDirname = path.join(__parentDirname, "__electrified");

///////////////////////////////////////////////////////////////////////////////
// CORE INVOKATION FUNCTIONS //////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

var readCmdLine = function(argv) {

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

    if (!readSettingsFromFile) {
        // read and evaluate target url
        settings.url = argv._;
        if (settings.url == undefined || settings.url.length == 0)
            help("No URL provided.");
        settings.url = String(settings.url);

        if (!vurl.isWebUri(settings.url))
             help("URI " + settings.url + " is malformed.");
    }

    // set some internal settings
    settings.httpClient = vurl.isHttpUri(settings.url) ? "http" : "https";
    settings.uriKey = settings.url.replace(/[^a-zA-Z0-9]/g, "_");
    settings.favicoBase = __udataDirname + "/favicon_"
        + settings.uriKey;
    settings.favicoIn =  settings.favicoBase + ".ico";
    settings.favicoOut = settings.favicoBase + ".png";

    if (readSettingsFromFile) // don"t parse cmd line in this case
        return settings;

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

    return settings;
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

var getFaviconUrl = function (settings) {
    return new Promise(function(resolve, reject) {

        // skip on existing png icon file
        if (fileExists( settings.favicoOut )) {
            resolve(settings);
            return;
        }

        favicon(settings.url, function(err, data) {
            if (err != undefined)
                reject();
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
        // console.log("Platform: " + os.platform() + "-" + os.arch());
        if (os.platform() === "win32" &&
            (os.arch() === "x64" || os.arch() === "ia32")) {
            convert = __dirname + "/ext/imagemagick-windows/convert.exe";
        } else {
            console.log("No built-in resize backend for this platform " +
                "present. Will try to use default.");
        }

        var opts = [settings.favicoIn, settings.favicoOut ];
        exec.execFile(convert, opts, function(err, stdout, stderr) {
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
            settings.favicoOut = path.join(__udataDirname, selectedFile);
            resolve(settings);
        });
    });
};


var setupWebcontent = function (settings, splash) {
    return new Promise(function(resolve, reject) {
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

        // console.log("Platform: " + os.platform() + "-" + os.arch());
        var symlink = undefined;
        if (os.platform() === "win32" &&
            (os.arch() === "x64" || os.arch() === "ia32")) {
            symlink = __dirname + "\\ext\\shortcut-windows.bat";
        } else {
            console.log("No built-in symlink backend for this platform " +
                "present.");
        }

        var urlObj = url.parse(settings.url);
        var pageName = urlObj.hostname.replace(/\.[^\.]+$/, "")
            .replace(/.*\./, "");
        pageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

        var symlinkFile = __parentDirname + "\\Electrify " + pageName
            + ".lnk";
        var settingsFile =  __udataDirname + "\\electrify-" +
            urlObj.hostname + ".settings.txt";

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

        // console.log(opts);

        exec.execFile(symlink, opts, function(err, stdout, stderr) {
            if (err) {
                console.log("Could not generate symlink. " + err.message);
            }
        });

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

var startApplication = function(settings, splash) {

    // console.log("=== SETTINGS ===");
    // console.log(JSON.stringify(settings, null, 4));
    // console.log("================");

    openSplash().then(function(data) {
        console.log("Splash screen loaded.");
        splash = data;
        return getFaviconUrl(settings);
    })
    .then(function() {
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
    startApplication(readCmdLine(argv));
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
