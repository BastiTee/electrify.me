"use-strict";
const core = require("./core.js");
const app = require("electron").app;
const minimist = require("minimist");

app.on("window-all-closed", function() {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("ready", function() {
    var argv = minimist(process.argv.slice(2));
    var settings;
    var splash;

    Promise.resolve().then(function() {
        console.log("Electrify initialization started.");
        return core.readCmdLine(argv);
    }).then(function(data) {
        settings = data;
        console.log("Read command line.");
        return core.openSplash();
    }).then(function(data) {
        splash = data;
        console.log("Loaded splash screen.");
        return core.resolveToFullyQualifiedUrl(settings);
    }).then(function(data) {
        settings = data;
        console.log("Resolved input url: " + settings.url);
        return core.getFaviconUrl(settings);
    }).then(function() {
        console.log("Received favicon url: " + settings.faviconUrl);
        return core.getFavicon(settings);
    }).then(function() {
        console.log("Downloaded favicon: " + settings.favicoIn);
        return core.convertFaviconToPng(settings);
    }).then(function() {
        console.log("Converted favicon: " + settings.favicoOut);
        return core.selectBestFavicon(settings);
    }).then(function() {
        console.log("Selected best favicon: " + settings.favicoOut);
        return core.setupWebcontent(settings, splash);
    }).then(function(browserWindow) {
        console.log("Finished application pre-processing.");
        return core.injectCss(settings, browserWindow);
    }).then(function(browserWindow) {
        browserWindow.show();
        console.log("Injected css.");
        return core.createDesktopLinks(settings);
    }).then(function(settings) {
        console.log("Created desktop links.");
        return core.storeSettings(settings);
    }).then(function() {
        console.log("Stored settings file.");
        console.log("Electrify initialization done.");
    });
});
