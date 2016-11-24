var helper = (function() {
    "use-strict";
    const fs = require("fs");

    exports.isVoid = function(object) {
        return typeof object === "undefined" || object === null || object === "";
    };

    exports.help = function(message) {
        if (!this.isVoid(message))
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

    exports.fileExists = function(filename) {
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

    exports.mkdirSilent = function(directory) {
        try {
            fs.mkdirSync(directory);
        } catch (ex) {
            if (ex.code !== "EEXIST")
                this.help(ex.message);
        }
    };

    exports.isPng = function(filename) {
        return (filename.toLowerCase().indexOf(".png") >= 0 &&
            filename.toLowerCase().indexOf("fluidicon") <= 0);
    };

    exports.isIco = function(filename) {
        return filename.toLowerCase().indexOf(".ico") >= 0;
    };

    exports.cleanArray = function(actual) {
        var newArray = new Array();
        for (var i = 0; i < actual.length; i++) {
            if (actual[i])
                newArray.push(actual[i]);
        }
        return newArray;
    };

    exports.readSettingsFromFile = function(settingsFile) {
        var settings = {};
        if (this.isVoid(settingsFile))
            return "";
        try {
            settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
        } catch (err) {
            this.help("Error loading properties. " + err.message);
        }
        settings.pathToSettings = settingsFile;
        return settings;
    };

}());
