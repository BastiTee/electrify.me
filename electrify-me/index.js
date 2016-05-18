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
    console.log("");
    console.log("Example: <electrify> https://web.whatsapp.com "
        + "-c inject.css -d");
    process.exit(0);
}

// EXTERNAL LIBRARIES AND TOOLS ///////////////////////////////////////////////

const vurl = require('valid-url');
const minimist = require('minimist')
const electron = require("electron");
const exec = require('child_process');
const http = require('http');
const https = require('https');
const favicon = require('favicon');
const fs = require('fs');
const app = electron.app;
const ipc = electron.ipcMain;
// TODO That's pretty ugly, maybe there is a javascript only ICO 2 PGN
const convert = __dirname + "/ext/imagemagick-windows/convert.exe";

// PARSE COMMAND LINE /////////////////////////////////////////////////////////

const argv = minimist(process.argv.slice(2));
var url = argv._;
if (url == undefined || url.length == 0)
    help("No URL provided.");
url = String(url);
if (!vurl.isWebUri(url))
    help("URI '" + url + "' is malformed.");
const cssFile = argv.c != undefined ? argv.c : undefined;
if (cssFile == "" || cssFile == true || cssFile == false)
    help("CSS option used, but no filepath provided.");
const devMode = argv.d != undefined ? true : false;
const maximized = argv.m != undefined ? true : false;
const httpClient = vurl.isHttpUri(url) ? http : https;
const uriKey = url.replace(/[^a-zA-Z0-9]/g, "_");
const favicoIn = __dirname + "/favicon_" + uriKey + ".ico";
const favicoOut = __dirname + "/favicon_" + uriKey + ".png";

// CORE INVOKATION FUNCTIONS //////////////////////////////////////////////////

var openSplash = function() {
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
    return splash;
};

var getFaviconUrl = function () {
    return new Promise(function(resolve, reject) {
        favicon(url, function(err, favicon_url) {
            if (err != undefined)
                reject();
            resolve(favicon_url);
        });
    });
};

var getFavicon = function (sourceUrl, targetFile) {
    return new Promise(function(resolve, reject) {
        var file = fs.createWriteStream(targetFile);
        var request = httpClient.get(sourceUrl, function(response, err) {
            var stream = response.pipe(file);
            stream.on('finish', function () {
                resolve();
            });
        });
    });
};

var convertFaviconToPng = function (sourceFile, targetFile) {
    return new Promise(function(resolve, reject) {
        var opts = [sourceFile+"[0]", targetFile ];
        exec.execFile(convert, opts, function(err, stdout, stderr) {
            resolve();
        });
    });
};

var setupWebcontent = function (faviconFile, splash) {
    return new Promise(function(resolve, reject) {
        const windowSettings = {
            fullscreen: false,
            fullscreenable: true,
            resizable: true,
            movable: true,
            frame: true,
            icon: faviconFile,
            show: false,
            webPreferences: {
                nodeIntegration: false
            },
        };
        var bw = new electron.BrowserWindow(windowSettings);
        bw.setMenu(null);  // disable default menu
        if (devMode)
            bw.openDevTools({ detach: true });
        bw.loadURL(url);
        bw.webContents.on("did-finish-load", function() {
            console.log("All data loaded.");
            splash.destroy();
            if (maximized)
                bw.maximize();
            bw.show();
        });
        bw.on("closed", function() {
            bw = null;
        });
        resolve(bw);
    });
};

var injectCss = function ( bw ) {
    return new Promise(function(resolve, reject) {
        if (cssFile == undefined) {
            console.log("No css file provided.");
            resolve(bw);
            return;
        }
        fs.readFile(cssFile, 'utf8', function (err,data) {
            if (err) {
                console.log(err);
                console.log("Could not read provided CSS file. Ignoring.");
                resolve(bw);
                return;
            }
            bw.webContents.insertCSS (data);
            resolve(bw);
        });
    });
};

// CORE CONTROLLER ////////////////////////////////////////////////////////////

var startApplication = function() {
    const splash = openSplash();
    getFaviconUrl()
    .then(function(favicon_url) {
        console.log("Received favicon url:\n\t" + favicon_url);
        return getFavicon(favicon_url, favicoIn);
    })
    .then(function() {
        console.log("Downloaded favicon to:\n\t" + favicoIn);
        return convertFaviconToPng(favicoIn, favicoOut);
    })
    .then(function(){
        console.log("Converted favicon to:\n\t" + favicoOut);
        return setupWebcontent(favicoOut, splash);
    })
    .then(function(bw) {
        console.log("Preprocessing done.");
        return injectCss(bw, cssFile);
    })
    .then(function(bw) {
        console.log("Finished invokations.");
    })
};

// CORE EVENTS ////////////////////////////////////////////////////////////////
app.on("window-all-closed", function() {
    if (process.platform != "darwin") {
        app.quit();
    }
});
app.on("ready", startApplication);

})();
