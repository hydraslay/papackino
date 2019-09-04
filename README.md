# papackino
bundle your bundled bundle to a single file mono-bundle.

# install
```
npm install -g papackino
```

# usage

```
papackino <input-file.html> <output-file.html>
```
# feature 
* this tool is ONLY for a "bundled bundle" that do not have many reference level.
* direct referenced js/css in the index.html will be fetched and bundle as script/style tags into output-file.html
* 1-level referenced font(woff, ttf...) from css files will be fetched and bundle as base64 encoded url() into output-file.html
* referenced image... <TBD>
* able to inject js in case you are using electron.ipcRenderer <TBD>
