var core = (function() {

    // Native node dependencies
    const url = require("url");
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const cp = require("child_process");
    const uuidv1 = require('uuid/v1');

    // External dependencies
    const $ = require("cheerio");
    const request = require("request");
    const vurl = require("valid-url");
    const walk = require("walk");

    // Electron dependencies
    const electron = require("electron");

    // External files
    const helper = require("./helper.js");

    // Constants
    const __parentDirname = path.resolve(__dirname, "..");
    const __udataDirname = path.join(__parentDirname, "_electrified");

    var downloadFile = function(from, to) {
        return new Promise(function(resolve, reject) {

            if (helper.fileExists(to)) {
                resolve(to);
                return;
            }

            var stream = request({
                url: from,
                timeout: 5000
            }, function(error) {
                if (error) {
                    console.log(error);
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
                console.log("No built-in resize backend for this platform " +
                    "present. Will try to use 'convert' on path.");
            }

            var opts = [icoFile, icoFile + ".png"];
            cp.execFile(convert, opts, function(err, stdout, stderr) {
                if (err) {
                    console.log(
                        "Could not generate pgn. Will skip this step. " +
                        err.message);
                    // remove input file to allow retries
                    fs.unlinkSync(icoFile);
                    resolve();
                }
                resolve();
            });
        });
    };

    var appendDefaultSettings = function(settings, argv) {
        settings.cssFile = argv.c;
        settings.devMode = !helper.isVoid(argv.d);
        settings.maximized = !helper.isVoid(argv.m);
        settings.hideScrollbars = false;
        settings.windowSettings = {
            fullscreen: false,
            fullscreenable: true,
            resizable: true,
            movable: true,
            frame: true,
        };
        return settings;
    };

    var printHelpMenu = function(argv) {
        if (!helper.isVoid(argv.h) ||
            !helper.isVoid(argv.help)) {
            helper.help();
        }
    };

    exports.readCmdLine = function(argv) {
        return new Promise(function(resolve, reject) {
            printHelpMenu(argv);

            // try to read and evaluate settings file..
            var settings = helper.readSettingsFromFile(argv.r);
            var readFromFile = !helper.isVoid(settings);
            // URL basic validation
            if (!readFromFile) {
                settings = {};
                settings.url = String(argv._);
            }
            if (helper.isVoid(settings.url)) {
                helper.help("No URL provided.");
            }

            // set some internal settings
            settings.uriKey = settings.url
                .replace(/[^a-zA-Z0-9]/g, "_")
                .replace(/^https?_+/, "")
            settings.workingDir = __udataDirname + "/" + settings.uriKey;
            settings.faviconIn = settings.workingDir + ".ico";
            settings.faviconOut = settings.workingDir + ".png";

            if (readFromFile) {
                // dont parse cmd line in this case
                resolve(settings);
                return;
            }

            settings = appendDefaultSettings(settings, argv);
            helper.mkdirSilent(__udataDirname);
            helper.mkdirSilent(settings.workingDir);

            resolve(settings);
        });
    };

    exports.resolveToFullyQualifiedUrl = function(settings) {
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
            }, function(error, response, body) {
                if (error || response.statusCode !== 200)
                    helper.help(
                        "Could not resolve unqualified URI " + urlBefore);
                var json = JSON.parse(body);
                try {
                    settings.url = json.Results[0].FirstURL;
                    resolve(settings);
                } catch (err) {
                    helper.help(
                        "Could not resolve unqualified URI " + urlBefore);
                }
            });
        });
    };

    exports.getFaviconUrl = function(settings) {
        return new Promise(function(resolve, reject) {

            // skip on existing png icon file
            if (helper.fileExists(settings.faviconOut)) {
                settings.faviconUrl = settings.faviconOut;
                resolve(settings);
                return;
            }

            var rootWebpath = settings.url.replace(
                /:\/\//, "@").replace(/\/.*/g, "").replace(/@/, "://");
            console.log("Root webpath for favicon-search: " + rootWebpath);

            request({
                url: rootWebpath,
                timeout: 5000
            }, function(error, response, body) {
                if (error || response.statusCode !== 200)
                    helper.help("Could not get favicon." + rootWebpath);
                var candidates = [];
                var pageContent = $.load(body);
                var links = pageContent("link");

                $(links).each(function() {
                    var href = $(this).attr("href");
                    if (helper.isIco(href) || helper.isPng(href)) {
                        var relpath = vurl.isUri(href) ?
                            href : rootWebpath + "/" + href.replace(/^[ ]*\/+/, "").trim();
                        candidates.push(relpath);
                    }
                });

                settings.faviconUrl = candidates;
                resolve(settings);
            });
        });
    };

    exports.getFavicon = function(settings) {
        return new Promise(function(resolve, reject) {
            // skip on existing png icon file
            if (helper.fileExists(settings.faviconOut)) {
                resolve();
                return;
            }
            if (helper.isVoid(settings.faviconUrl)) {
                // return when previous step did not find a favicon
                delete settings.faviconIn;
                resolve();
                return;
            }

            var foundPng = false;

            var promises = [];
            for (var i = 0; i < settings.faviconUrl.length; i++) {

                var favUrl = settings.faviconUrl[i];
                var filename = __udataDirname + "/" + settings.uriKey +
                    "/" + favUrl.replace(/.*\/([^/]*)/, "\$1");

                if (helper.isPng(favUrl))
                    foundPng = true;
                // skip icos when a png was found
                if (foundPng && helper.isIco(favUrl))
                    continue;
                promises.push(downloadFile(favUrl, filename));
            }

            var dlChain = Promise.resolve();
            Promise.all(promises).then((values) => {
                values = helper.cleanArray(values);
                settings.faviconIn = values;
                resolve(settings);
            });
        });
    };

    exports.convertFaviconToPng = function(settings) {
        return new Promise(function(resolve, reject) {

            // skip on existing png icon file
            if (helper.fileExists(settings.faviconOut)) {
                resolve();
                return;
            }

            var promises = [];
            for (var i = 0; i < settings.faviconIn.length; i++) {
                var fav = settings.faviconIn[i];
                if (helper.isIco(fav)) {
                    promises.push(convertIcon(settings, fav));
                }
            }
            var dlChain = Promise.resolve();
            Promise.all(promises).then((values) => {
                resolve(settings);
            });
        });
    };

    exports.selectBestFavicon = function(settings) {
        return new Promise(function(resolve, reject) {

            var maxSize = 0;
            var selectedFile;
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
                if (!helper.isVoid(selectedFile))
                    settings.faviconOut = path.join(
                        settings.workingDir, selectedFile);
                resolve(settings);
            });
        });
    };

    exports.setupWebcontent = function(settings) {
        return new Promise(function(resolve, reject) {

            // if no favicon was found, set it to default
            if (!helper.fileExists(settings.faviconOut)) {
                console.log(
                    "Favicon PNG does not exist. Will use default icon.");
                settings.faviconIn = path.join(
                    __dirname, "favicon-default.ico");
                settings.faviconOut = path.join(
                    __dirname, "favicon-default.png");
            }

            // if manual icon is set, try to set it ..
            var settingsDir;
            if (!helper.isVoid(settings.pathToSettings))
                settingsDir = path.resolve(settings.pathToSettings, "..");
            var miconAbsPath = settings.manualIcon;
            var miconSettingsPath = (
                helper.isVoid(settingsDir) ||
                helper.isVoid(settings.manualIcon) ?
                settings.manualIcon : path.join(settingsDir,
                    settings.manualIcon));
            if (!helper.isVoid(miconAbsPath) &&
                helper.fileExists(miconAbsPath)) {
                console.log(
                    "Manual icon path resolved. Will set icon to: " +
                    miconAbsPath);
                settings.faviconOut = miconAbsPath;
            } else if (!helper.isVoid(miconSettingsPath) &&
                helper.fileExists(miconSettingsPath)) {
                console.log("Manual icon path resolved. Will set icon to: " +
                    miconSettingsPath);
                settings.faviconOut = miconSettingsPath;
            }

            settings.windowSettings.icon = settings.faviconOut;
            settings.windowSettings.show = false;
            settings.windowSettings.webPreferences = {
                nodeIntegration: false
            };
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
                if (settings.maximized)
                    bw.maximize();
                resolve(bw);
            });
            bw.webContents.on("did-fail-load", function(event, errorCode,
                errorDescription, validatedURL) {
                if (errorCode !== -3)
                    helper.help(
                        "Electrifying failed unrecoverable. " + errorCode);
            });
            // hook urls to default browser
            var handleRedirect = (e, url) => {
                if (url !== bw.webContents.getURL()) {
                    e.preventDefault();
                    electron.shell.openExternal(url);
                }
            };
            bw.webContents.on("new-window", handleRedirect);
        });
    };

    exports.injectCss = function(settings, bw) {
        return new Promise(function(resolve, reject) {

            if (settings.hideScrollbars === true)
                bw.webContents.insertCSS(
                    "body { overflow:hidden !important; }");

            if (helper.isVoid(settings.cssFile)) {
                resolve(bw);
                return;
            }

            var cssFile = settings.cssFile;
            if (!helper.fileExists(cssFile)) {
                if (helper.isVoid(settings.pathToSettings)) {
                    resolve(bw);
                    return;
                }
                var settingsDir = path.resolve(settings.pathToSettings, "..");
                console.log("CSS file " + cssFile + " does not exist. Will " +
                    "try to find it next to settings file in: " + settingsDir);
                cssFile = path.join(settingsDir, settings.cssFile);
                if (!helper.fileExists(cssFile)) {
                    console.log("Nope. Not there either.");
                    resolve(bw);
                    return;
                }
            }

            fs.readFile(cssFile, "utf8", function(err, data) {
                if (err) {
                    console.log(
                        "Could not read provided CSS file. Ignoring. " + err);
                    resolve(bw);
                    return;
                }
                bw.webContents.insertCSS(data);
                resolve(bw);
            });
        });
    };

    exports.createDesktopLinks = function(settings) {
        return new Promise(function(resolve, reject) {

            var urlObj = url.parse(settings.url);
            settings.settingsFile = path.join(__udataDirname,
                settings.uriKey + ".settings.txt");

            if (os.platform() === "win32") {

                var symlink = __dirname + "\\ext\\shortcut-windows.bat";
                var symlinkFile = path.join(__udataDirname,
                    "electrify_" + settings.uriKey + ".lnk");

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
                    settings.faviconOut
                ];

                cp.execFile(symlink, opts,
                    function(err, stdout, stderr) {
                        if (err)
                            console.log("Could not generate symlink. " + err);
                        resolve(settings);
                    });

            } else if (os.platform() === "linux") {

                var targetFile = path.join(__udataDirname,
                    "electrify_" + settings.uriKey + ".desktop");
                var installTargetFile = path.join(os.homedir(),
                    ".local", "share", "applications",
                    "electrify_" + settings.uriKey + ".desktop");
                if (helper.fileExists(targetFile)) {
                    console.log("Desktop launcher exists. Will skip.");
                } else {

                    var iconPathAbs = settings.faviconOut;
                    var command = path.join(__parentDirname, "node_modules",
                            "electron", "dist", "electron") + " " +
                        __parentDirname + " -r " +
                        settings.settingsFile;
                    var stream = fs.createWriteStream(targetFile, {
                        flags: 'w',
                        defaultEncoding: 'utf8',
                        fd: null,
                        mode: 0o744,
                        autoClose: true
                    });
                    stream.once("open", function(fd) {
                        stream.write("[Desktop Entry]\n");
                        stream.write("Encoding=UTF-8\n");
                        stream.write("Version=1.0\n");
                        stream.write("Type=Application\n");
                        stream.write("Name=" + urlObj.hostname + "\n");
                        stream.write("Icon=" + iconPathAbs + "\n");
                        stream.write("Exec=" + command + "\n");
                        stream.write("StartupNotify=false\n");
                        stream.write("StartupWMClass=" + uuidv1() + "\n");
                        stream.end();
                    });
                }

                // try to install
                if (helper.fileExists(installTargetFile)) {
                    console.log("Global desktop launcher exists. Will skip.");
                } else {
                    console.log("Will install launcher to: " +
                        installTargetFile);
                    var rs = fs.createReadStream(targetFile);
                    var ws = fs.createWriteStream(installTargetFile);
                    ws.on('error', function(err) {
                        console.log("ERROR:" + err);
                    });
                    rs.pipe(ws);
                }

                resolve(settings);

            } else {
                console.log(
                    "No built-in symlink backend for this platform present.");
                resolve(settings);
            }
        });
    };

    exports.storeSettings = function(settings) {
        return new Promise(function(resolve, reject) {

            var sFile = settings.settingsFile;
            if (helper.fileExists(sFile)) {
                console.log("Local settings file exists. Will skip.");
                resolve(settings);
                return;
            }
            // delete internal settings
            delete settings.windowSettings.icon;
            delete settings.windowSettings.webPreferences;
            delete settings.windowSettings.show;
            delete settings.pathToSettings;
            delete settings.uriKey;
            delete settings.faviconIn;
            delete settings.faviconUrl;
            delete settings.faviconOut;
            delete settings.workingDir;
            delete settings.settingsFile;
            if (helper.isVoid(settings.cssFile))
                settings.cssFile = null;
            if (helper.isVoid(settings.manualIcon))
                settings.manualIcon = null;

            fs.writeFile(sFile,
                JSON.stringify(settings, null, 2), "utf-8",
                function(err) {
                    if (err)
                        console.log(err);
                }
            );

            resolve(settings);
        });
    };
}());