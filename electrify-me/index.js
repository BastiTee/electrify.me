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

    Promise.resolve().then(function() {
        console.log("Electrify initialization started.");
        return core.readCmdLine(argv);
    }).then(function(data) {
        settings = data;
        console.log("Read command line.");
        return core.resolveToFullyQualifiedUrl(settings);
    }).then(function(data) {
        console.log("Resolved input url: " + settings.url);
        return core.getFaviconUrl(settings);
    }).then(function() {
        console.log("Received favicon url: " + settings.faviconUrl);
        return core.getFavicon(settings);
    }).then(function() {
        console.log("Downloaded favicon: " + settings.faviconIn);
        return core.convertFaviconToPng(settings);
    }).then(function() {
        console.log("Converted favicon: " + settings.faviconOut);
        return core.selectBestFavicon(settings);
    }).then(function() {
        console.log("Selected best favicon: " + settings.faviconOut);
        return core.setupWebcontent(settings);
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