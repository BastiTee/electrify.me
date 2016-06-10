![Electrify-Logo](dev/logo+text.png)
> Create a native-like app from a website. Just like that.

[![GitHub release](https://img.shields.io/badge/version-0.1.1-green.svg)](https://github.com/BastiTee/electrify.me/releases/tag/0.1.1)
## About

*electrify.me* is a tool to run a website as native-like windows, mac or linux application. Electrified websites are available in your task bar, start menu or launchers. Just like a native application.

You can customize the apperance of your electrified website by injecting CSS into the website, start the app in kiosk mode, open it at specific window positions [and much more](http://electron.atom.io/docs/api/browser-window/#new-browserwindowoptions).

![Screenshot](dev/screenshot.png)

## Usage

### Quick start

```
>> npm install
>> npm start -- https://web.whatsapp.com
```

Limitation: On linux and mac you need to have "convert" (part of imagemagick) 
on your system path to support favicon-to-appicon conversion (see below for details).

### Options

For details on options etc. run:

```
>> npm start -- -h

Usage:   <electrify> [URL] ([OPTS])

Options:
    -c <FILE>   CSS to be injected into website.
    -m          Window maximized.
    -d          Run in development mode.
    -r <FILE>   Read settings from local file (all other options are ignored).
    -w <FILE>   Write settings to local file.
    -h          Print this help.

Example: <electrify> https://web.whatsapp.com -c inject.css -d
```

### Settings file

The setting file that you can read/write via the command-line options will look something like this:

```
{
  "url": "https://web.whatsapp.com",
  "devMode": false,
  "maximized": false,
  "windowSettings": {
    "fullscreen": false,
    "fullscreenable": true,
    "resizable": true,
    "movable": true,
    "frame": true
  },
  "faviconUrl": "https://web.whatsapp.com/favicon.ico"
}
```

| Parameter | Purpose |
|-------------|------------|
| url | The URL you want to electrify |
| devMode | If  true, opens the chromium devevelopment console on startup |
| maximized | If true, opens the window maximized |
| windowSettings | Fine-grained [Electron window settings](http://electron.atom.io/docs/api/browser-window/#new-browserwindowoptions) (Attention: Parameters icon, show, and webPreferences will always be overwritten) |
| faviconUrl | Auto-detected path to favicon of website |

## Limitations and future work

*electrify.me* is in its baby shoes. Pull requests and ideas are very welcomed.

### Current To-Dos

**Favicon extraction**

Favicon extraction is still somewhat shaky. The reason is that icon files are not supported by 
electron and that there is no non-native way to convert ico to png. Currently imagemagick/convert is used. 
So further work would be:

- [ ] Add an imagemagick build for linux systems to support ico-2-png conversion for it.
- [ ] Add an imagemagick build for mac systems to support ico-2-png conversion for it.

or

- [ ] Find a way to [convert ico files to pngs without imagemagick](http://stackoverflow.com/questions/37391106/convert-ico-icon-file-to-png-image-file-using-plain-javascript) (or other native dependencies)

or

- [ ] Wait for electron to [support ICO files](https://github.com/electron/electron/issues/2277)

**Installing**

- [ ] Create executable packages
- [ ] Create installer packages

## Licence and attributions

Icon made by [Freepik](http://www.flaticon.com/authors/freepik) from [www.flaticon.com](http://www.flaticon.com/free-icon/light-bulb_125292)

Code is licensed under GPLv3.

This small tool is powered by the awesome [Electron framework](http://electron.atom.io/).

