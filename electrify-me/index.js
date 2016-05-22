(function() {
"use-strict";

// CMD LINE DOCUMENTATION /////////////////////////////////////////////////////

function help( message ) {
    if (message != undefined)
        console.log(message);
    console.log("Usage:   <electrify> [URL] ([OPTS])");
    console.log("");
    console.log("Options: ");
    console.log("    -c <FILE>   CSS to be injected into website.");
    console.log("    -m          Start maximized.");
    console.log("    -d          Run in development mode.");
    console.log("    -r <FILE>   Read settings from local file "
        + "(all other options are ignored).");
    console.log("    -w <FILE>   Write settings to local file.");
    console.log("    -h          Print this help.");
    console.log("");
    console.log("Example: <electrify> https://web.whatsapp.com "
        + "-c inject.css -d");
    process.exit(0);
};

// EXTERNAL LIBRARIES AND TOOLS ///////////////////////////////////////////////

const vurl = require("valid-url");
const minimist = require("minimist")
const electron = require("electron");
const exec = require("child_process");
const http = require("http");
const https = require("https");
const favicon = require("favicon");
const fs = require("fs");
const app = electron.app;
const ipc = electron.ipcMain;
// TODO That"s pretty ugly, maybe there is a javascript only ICO 2 PGN
const convert = __dirname + "/ext/imagemagick-windows/convert.exe";

// CORE INVOKATION FUNCTIONS //////////////////////////////////////////////////

var readCmdLine = function(argv) {
    if ( argv.h != undefined || argv.help != undefined)
        help();
    var settings = {};

    // try to read and evaluate settings file..
    if (argv.r != undefined) {
        if (argv.r == "" || argv.r == true || argv.r == false) {
            help("Read-settings option used, but no filepath provided.");
        }
        try {
            settings = JSON.parse(fs.readFileSync(argv.r, "utf-8"));
            console.log("Read settings from file " + argv.r
                + ". Content was:\n" + JSON.stringify(
                    settings, null, 2));
        } catch (err) {
            help (err.message);
        }
        return settings;
    };

    // read and evaluate target url
    settings.url = argv._;
    if (settings.url == undefined || settings.url.length == 0)
        help("No URL provided.");
    settings.url = String(settings.url);
    if (!vurl.isWebUri(settings.url))
         help("URI " + settings.url + " is malformed.");

    // read optional input  files
    settings.cssFile = argv.c != undefined ? argv.c : undefined;
    if (settings.cssFile == "" || settings.cssFile == true ||
        settings.cssFile == false)
        help("CSS option used, but no filepath provided.");
    settings.targetSettingsFile = argv.w;
    if (settings.targetSettingsFile == "" || settings.targetSettingsFile == true ||
        settings.targetSettingsFile == false) {
        help("Write-settings option used, but no filepath provided.");
    }

    // read optional cmd toggles
    settings.devMode = argv.d != undefined ? true : false;
    settings.maximized = argv.m != undefined ? true : false;

    // set some internal data
    settings.httpClient = vurl.isHttpUri(settings.url) ? "http" : "https";
    settings.uriKey = settings.url.replace(/[^a-zA-Z0-9]/g, "_");
    settings.favicoIn = __dirname + "/favicon_" + settings.uriKey + ".ico";
    settings.favicoOut = __dirname + "/favicon_" + settings.uriKey + ".png";

    return settings;
};

var openSplash = function() {
    return new Promise(function(resolve, reject) {
        var splash = new electron.BrowserWindow({
            width: 100,
            height: 100,
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
        splash.loadURL(__dirname + "/splash.html");
        splash.webContents.on("did-finish-load", function() {
            splash.show();
        });
        resolve(splash);
    });
};

var getFaviconUrl = function (settings) {
    return new Promise(function(resolve, reject) {
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
        var file = fs.createWriteStream(settings.favicoIn);
        var client = settings.httpClient == "http" ? http : https;
        var request = client.get(settings.faviconUrl,
            function(response, err) {

            var stream = response.pipe(file);
            stream.on("finish", function () {
                resolve(settings);
            });
        });
    });
};

var convertFaviconToPng = function (settings) {
    return new Promise(function(resolve, reject) {
        var opts = [settings.favicoIn+"[0]", settings.favicoOut ];
        exec.execFile(convert, opts, function(err, stdout, stderr) {
            resolve(settings);
        });
    });
};

var setupWebcontent = function (settings, splash) {
    return new Promise(function(resolve, reject) {
        const windowSettings = {
            fullscreen: false,
            fullscreenable: true,
            resizable: true,
            movable: true,
            frame: true,
            icon: settings.favicoOut,
            show: false,
            webPreferences: {
                nodeIntegration: false
            },
        };
        var bw = new electron.BrowserWindow(windowSettings);
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
                console.log("CSS data read:\n\t" + data);
            }
            bw.webContents.insertCSS (data);
            resolve();
        });
    });
};

var storeSettings = function (settings) {
    return new Promise(function(resolve, reject) {
        if (settings.targetSettingsFile == undefined) {
            console.log("Settings will not be saved.");
            resolve();
            return;
        }
        // keep and remove setting from settings object
        var targetFile = settings.targetSettingsFile;
        delete settings.targetSettingsFile;
        fs.writeFile(targetFile,
            JSON.stringify(settings, null, 2), "utf-8",
            function(err) {
                console.log("Successfully written settings to " + targetFile);
                resolve();
            }
        );
    });
};

// CORE CONTROLLER ////////////////////////////////////////////////////////////

var startApplication = function(settings, splash) {

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
};

// CORE EVENTS ////////////////////////////////////////////////////////////////
app.on("window-all-closed", function() {
    if (process.platform != "darwin") {
        app.quit();
    }
});

app.on("ready", function() {
    const argv = minimist(process.argv.slice(2));
    startApplication(readCmdLine(argv));
});

})();
