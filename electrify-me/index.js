"use-strict";

// Node-internal dependencies
const url = require("url");
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

// External dependencies
const $ = require("cheerio");
const minimist = require("minimist");
const request = require("request");
const vurl = require("valid-url");
const walk = require("walk");

// Electron dependencies
const electron = require("electron");
const app = electron.app;
const ipc = electron.ipcMain;
const tray = electron.Tray;

// Constants
const __parentDirname = path.resolve(__dirname, "..");
const __udataDirname = path.join(__parentDirname, "_electrified");

//////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
//////////////////////////////////////////////////////////////////

var help = function(message) {
    if (!isVoid(message))
        console.log(message);
    console.log("Usage:   <electrify> [URL] ([OPTS])");
    console.log("");
    console.log("Options: ");
    console.log("    -c <FILE>   CSS to be injected into website.");
    console.log("    -m          Window maximized.");
    console.log("    -d          Run in development mode.");
    console.log("    -r <FILE>   Read settings from local file " +
        "(all other options are ignored).");
    console.log("    -h          Print this help.");
    console.log("");
    console.log("Example: <electrify> https://web.whatsapp.com " +
        "-c inject.css -d");

    // display of help always terminates the application.
    process.exit(0);
};

var logError = function(message, exception, exit) {
    if (!isVoid(message))
        console.log("[ERROR] " + message);
    if (!isVoid(exception))
        console.log("        Exception was: " + exception);
    if (exit)
        process.exit(0);
};

var fileExists = function(filename) {
    try {
        fs.accessSync(filename, fs.F_OK | fs.R_OK);
        var stat = fs.statSync(filename);
        if (stat["size"] === 0)
            return false;
        return true;
    } catch (err) {
        return false;
    }
};

var mkdirSilent = function(directory) {
    try {
        fs.mkdirSync(directory);
    } catch (ex) {
        if (ex.code !== "EEXIST")
            help(ex.message);
    }
};

var png = function(filename) {
    return (filename.toLowerCase().indexOf(".png") >= 0 &&
        filename.toLowerCase().indexOf("fluidicon") <= 0);
};

var ico = function(filename) {
    return filename.toLowerCase().indexOf(".ico") >= 0;
};

var cleanArray = function(actual) {
    var newArray = new Array();
    for (var i = 0; i < actual.length; i++) {
        if (actual[i])
            newArray.push(actual[i]);
    }
    return newArray;
};

var isVoid = function(object) {
    return typeof object === "undefined" || object === null || object === "";
};

//////////////////////////////////////////////////////////////////
// CORE INVOKATION FUNCTIONS //////////////////////////////////////////////////////////////////

var readSettingsFromFile = function(argv, settings) {
    if (isVoid(argv.r))
        return;
    try {
        settings = JSON.parse(fs.readFileSync(argv.r, "utf-8"));
    } catch (err) {
        help("Error loading properties. " + err.message);
    }
    settings.pathToSettings = argv.r;
    return true;
};

var readCmdLine = function(argv) {
    return new Promise(function(resolve, reject) { // TODO To complex!
        if (!isVoid(argv.help) || !isVoid(argv.help))
            help();
        // try to read and evaluate settings file..
        var settings = {};
        var settingsRead = readSettingsFromFile(argv, settings);

        // URL basic validation
        if (!settingsRead)
            settings.url = String(argv._);
        if (isVoid(settings.url))
            help("No URL provided.");

        // set some internal settings
        settings.httpClient = vurl.isHttpUri(settings.url) ? "http" : "https";
        settings.uriKey = settings.url.replace(/[^a-zA-Z0-9]/g, "_");
        settings.workingDir = __udataDirname + "/" + settings.uriKey;

        settings.favicoIn = settings.workingDir + ".ico";
        settings.favicoOut = settings.workingDir + ".png";

        if (settingsRead) {
            // dont parse cmd line in this case
            resolve(settings);
            return;
        }

        // read optional input  files
        settings.cssFile = argv.c;
        settings.devMode = !isVoid(argv.d);
        settings.maximized = !isVoid(argv.m);
        settings.hideScrollbars = true;

        // default window settings
        settings.windowSettings = {
            fullscreen: false,
            fullscreenable: true,
            resizable: true,
            movable: true,
            frame: true,
        };

        mkdirSilent(__udataDirname);
        mkdirSilent(settings.workingDir);

        resolve(settings);
    });
};

var openSplash = function() {
    return new Promise(function(resolve, reject) {

        // resolve();
        // return;

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

        var searchUrl = "https://duckduckgo.com/?q=" + urlBefore +
            "&format=json";
        request({
            url: searchUrl,
            timeout: 5000
        }, function(error, response, body) { // TODO Reduce complexity
            if (error || response.statusCode !== 200)
                logError("Could not resolve unqualified URI " + urlBefore,
                    undefined, true);

            var json = JSON.parse(body);
            try {
                settings.url = json.Results[0].FirstURL;
                if (!vurl.isWebUri(settings.url))
                    logError("Could not resolve unqualified URI " + urlBefore,
                        undefined, true);
                resolve(settings);
            } catch (err) {
                logError("Could not resolve unqualified URI " + urlBefore,
                    err, true);
            }
        });
    });
};

var getFaviconUrl = function(settings) {
    return new Promise(function(resolve, reject) {

        // skip on existing png icon file
        if (fileExists(settings.favicoOut)) {
            settings.faviconUrl = settings.favicoOut;
            resolve(settings);
            return;
        }

        var rootWebpath = settings.url.replace(/:\/\//, "@").replace(/\/.*/g, "").replace(/@/, "://");
        console.log("Root webpath for favicon-search: " + rootWebpath)

        request({
            url: rootWebpath,
            timeout: 5000
        }, function(error, response, body) {
            if (error || response.statusCode !== 200) {
                logError("Could not resolve unqualified URI " + rootWebpath,
                    undefined, true);
                resolve(settings);
            }

            var candidates = [];
            var pageContent = $.load(body);
            var links = pageContent("link");

            $(links).each(function() {
                var href = $(this).attr("href");
                if (ico(href) || png(href)) {
                    var relpath = rootWebpath + "/" + href.replace(/^\//, "");
                    candidates.push(relpath);
                }
            });

            settings.faviconUrl = candidates;
            resolve(settings);
        });
    });
};

var downloadFile = function(from, to) {
    return new Promise(function(resolve, reject) {

        if (fileExists(to)) {
            resolve(to);
            return;
        }

        var stream = request({
            url: from,
            timeout: 5000
        }, function(error) {
            if (error) {
                logError(error);
                fs.unlinkSync(to);
                resolve();
                return;
            }
        }).pipe(fs.createWriteStream(to));
        stream.on("finish", function() {
            resolve(to);
        });
        stream.on("error", function() {
            resolve();
        });
    });
};

var convertIcon = function(settings, icoFile) {
    return new Promise(function(resolve, reject) {
        var convert = "convert";
        if (os.platform() === "win32") {
            convert = __dirname + "/ext/imagemagick-windows/convert.exe";
        } else {
            logError("No built-in resize backend for this platform " +
                "present. Will try to use default.");
        }

        var opts = [icoFile, icoFile + ".png"];

        console.log("opts: " + opts + " << " + settings.faviconIn);

        childProcess.execFile(convert, opts, function(err, stdout, stderr) {
            if (err) {
                logError("Could not generate pgn. Will skip this step. " +
                    err.message);
                // remove input file to allow retries
                fs.unlinkSync(icoFile);
                resolve();
            }
            resolve();
        });
    });
};

var getFavicon = function(settings) {
    return new Promise(function(resolve, reject) {
        // skip on existing png icon file
        if (fileExists(settings.favicoOut)) {
            resolve();
            return;
        }
        if (isVoid(settings.faviconUrl)) {
            // return when previous step did not find a favicon
            settings.favicoIn = undefined;
            resolve();
            return;
        }

        var foundPng = false;

        var promises = [];
        for (var i = 0; i < settings.faviconUrl.length; i++) {

            var favUrl = settings.faviconUrl[i];
            var filename = __udataDirname + "/" + settings.uriKey + "/" + favUrl.replace(/.*\/([^/]*)/, "\$1");

            if (png(favUrl))
                foundPng = true;
            // skip icos when a png was found
            if (foundPng && ico(favUrl))
                continue;
            promises.push(downloadFile(favUrl, filename));
        }

        var dlChain = Promise.resolve();
        Promise.all(promises).then(values => {
            values = cleanArray(values);
            settings.favicoIn = values;
            resolve(settings);
        });
    });
};

var convertFaviconToPng = function(settings) {
    return new Promise(function(resolve, reject) {

        // skip on existing png icon file
        if (fileExists(settings.favicoOut)) {
            resolve();
            return;
        }

        var promises = [];
        for (var i = 0; i < settings.favicoIn.length; i++) {
            var fav = settings.favicoIn[i];
            if (ico(fav)) {
                promises.push(convertIcon(settings, fav));
            }
        }
        var dlChain = Promise.resolve();
        Promise.all(promises).then(values => {
            console.log(values);
            resolve(settings);
        });
    });
};

var selectBestFavicon = function(settings) {
    return new Promise(function(resolve, reject) {

        var maxSize = 0;
        var selectedFile = undefined;
        var candPatt = new RegExp(".*\\.png$", "i");

        var walker = walk.walk(settings.workingDir, {
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
            if (!isVoid(selectedFile))
                settings.favicoOut = path.join(settings.workingDir, selectedFile);
            resolve(settings);
        });
    });
};

var setupWebcontent = function(settings, splash) {
    return new Promise(function(resolve, reject) {

        // if no favicon was found, set it to default
        if (!fileExists(settings.favicoOut)) {
            logError("Favicon PNG does not exist. Will use default icon.");
            settings.favicoIn = path.join(__dirname, "favicon-default.ico");
            settings.favicoOut = path.join(__dirname, "favicon-default.png");
        }

        // if manual icon is set, try to set it ..
        var settingsDir = isVoid(settings.pathToSettings) ? undefined :
            path.resolve(settings.pathToSettings, "..");
        var miconAbsPath = settings.manualIcon;
        var miconSettingsPath = (
                isVoid(settingsDir) || isVoid(settings.manualIcon) ?
            settings.manualIcon : path.join(settingsDir, settings.manualIcon));

        if (!isVoid(miconAbsPath) && fileExists(miconAbsPath)) {
            console.log("Manual icon path resolved. Will set icon to: " +
                miconAbsPath);
            settings.favicoOut = miconAbsPath;
        } else if (!isVoid(miconSettingsPath) &&
            fileExists(miconSettingsPath)) {
            console.log("Manual icon path resolved. Will set icon to: " +
                miconSettingsPath);
            settings.favicoOut = miconSettingsPath;
        }

        // append internal window settings
        settings.windowSettings.icon = settings.favicoOut;
        settings.windowSettings.show = false;
        settings.windowSettings.webPreferences = {
            nodeIntegration: false
        };
        console.log(settings.windowSettings);
        var bw = new electron.BrowserWindow(settings.windowSettings);
        bw.setMenu(null); // disable default menu
        if (settings.devMode)
            bw.openDevTools({
                detach: true
            });
        bw.loadURL(settings.url);
        bw.on("closed", function() {
            bw = null;
        });
        bw.webContents.on("did-finish-load", function() {
            if (!isVoid(splash))
                splash.destroy();
            if (settings.maximized)
                bw.maximize();
            resolve(bw);
        });
        bw.webContents.on("did-fail-load", function(errorCode,
            errorDescription, validatedURL) {
            if (!isVoid(splash))
                splash.destroy();
            logError("Electrifying failed unrecoverable.", errorCode, true);
        });
        // hook urls to default browser
        var handleRedirect = (e, url) => {
                if (url !== bw.webContents.getURL()) {
                    e.preventDefault()
                    electron.shell.openExternal(url)
                }
            }
            //bw.webContents.on("will-navigate", handleRedirect)
        bw.webContents.on("new-window", handleRedirect)
    });
};

var injectCss = function(settings, bw) {
    return new Promise(function(resolve, reject) {

        if (settings.hideScrollbars === true)
            bw.webContents.insertCSS("body { overflow:hidden !important; }");

        if (isVoid(settings.cssFile)) {
            resolve(bw);
            return;
        }

        var cssFile = settings.cssFile;
        if (!fileExists(cssFile)) {
            if (isVoid(settings.pathToSettings)) {
                resolve(bw);
                return;
            }
            var settingsDir = path.resolve(settings.pathToSettings, "..");
            console.log("CSS file " + cssFile + " does not exist. Will " +
                "try to find it next to settings file in: " + settingsDir);
            cssFile = path.join(settingsDir, settings.cssFile);
            if (!fileExists(cssFile)) {
                console.log("Nope. Not there either.");
                resolve(bw);
                return;
            }
        }

        fs.readFile(cssFile, "utf8", function(err, data) {
            if (err) {
                logError("Could not read provided CSS file. Ignoring.", err);
                resolve(bw);
                return;
            }
            bw.webContents.insertCSS(data);
            resolve(bw);
        });
    });
};

var createDesktopLinks = function(settings) {
    return new Promise(function(resolve, reject) {

        var urlObj = url.parse(settings.url);
        settings.settingsFile = path.join(__udataDirname, "electrify-" +
            urlObj.hostname + ".settings.txt");

        if (os.platform() === "win32") {

            var symlink = __dirname + "\\ext\\shortcut-windows.bat";
            var symlinkFile = path.join(__udataDirname,
                "Electrify " + urlObj.hostname + ".lnk");

            var opts = [
                "-linkfile",
                symlinkFile,
                "-target",
                __parentDirname +
                "\\node_modules\\electron\\dist\\electron.exe",
                "-workdir",
                __parentDirname,
                "-linkarguments",
                "electrify-me -r " + settings.settingsFile,
                "-description",
                "Electrify " + urlObj.hostname,
                "-iconlocation",
                settings.favicoIn
            ];

            childProcess.execFile(symlink, opts,
                function(err, stdout, stderr) {
                    if (err)
                        logError("Could not generate symlink. ", err);
                    resolve(settings);
                });

        } else if (os.platform() === "linux") {

            var iconPathAbs = settings.favicoOut;
            var command = path.join(__parentDirname,
                    "node_modules", "electron", "dist",
                    "electron") + " --enable-transparent-visuals --disable-gpu " +
                path.join(__parentDirname, "electrify-me") + " -r " +
                settings.settingsFile;

            var targetFile = path.join(__udataDirname,
                settings.uriKey + ".desktop");
            var stream = fs.createWriteStream(targetFile);
            stream.once("open", function(fd) {
                stream.write("[Desktop Entry]\n");
                stream.write("Version=0.2.2\n");
                stream.write("Name=Electrify " + urlObj.hostname + "\n");
                stream.write("Comment=Electrified Version of " +
                    settings.url + "\n");
                stream.write("Path=" + __parentDirname + "\n");
                stream.write("Exec=" + command + "\n");
                stream.write("Icon=" + iconPathAbs + "\n");
                stream.write("Type=Application\n");
                stream.write("Encoding=UTF-8\n");
                stream.write("StartupNotify=false\n");
                stream.write("StartupWMClass=Electron\n");
                stream.write("OnlyShowIn=Unity;\n");
                stream.write("X-UnityGenerated=true\n");
                stream.end();
                fs.chmodSync(targetFile, 755);
                resolve(settings);
            });

        } else {
            logError("No built-in symlink backend for this platform present.");
            resolve(settings);
        }
    });
};

var storeSettings = function(settings) {
    return new Promise(function(resolve, reject) {

        var sFile = settings.settingsFile;

        // delete internal settings
        delete settings.windowSettings.icon;
        delete settings.windowSettings.webPreferences;
        delete settings.windowSettings.show;
        delete settings.httpClient;
        delete settings.pathToSettings;
        delete settings.uriKey;
        delete settings.favicoIn;
        delete settings.faviconUrl;
        delete settings.favicoOut;
        delete settings.workingDir;
        delete settings.settingsFile;
        if (isVoid(settings.cssFile))
            settings.cssFile = null;
        if (isVoid(settings.manualIcon))
            settings.manualIcon = null;

        fs.writeFile(sFile,
            JSON.stringify(settings, null, 2), "utf-8",
            function(err) {
                if (err)
                    logError(err);
            }
        );

        resolve(settings);
    });
};


//////////////////////////////////////////////////////////////////
// CORE CONTROLLER
//////////////////////////////////////////////////////////////////

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
        console.log("Resolved input URL to " + settings.url);
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

//////////////////////////////////////////////////////////////////
// CORE EVENTS //////////////////////////////////////////////////////////////////

app.on("window-all-closed", function() {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("ready", function() {
    const argv = minimist(process.argv.slice(2));
    startApplication(argv);
});
