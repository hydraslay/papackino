#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const fontMime = {
    ".woff": "application/font-woff",
    ".woff2": "application/font-woff",
    ".ttf": "application/x-font-ttf",
    ".otf": "application/x-font-otf",
    ".eot": "application/vnd.ms-fontobject",
}

if (process.argv.length < 4) {
    console.log('usage: papackino in-file.html out-file.html');
    process.exit(2);
    return;
}
const src = process.argv[2];
const dest = process.argv[3];

if (!fs.existsSync(src)) {
    console.error(`file ${src} not found.`);
    process.exit(1);
    return;
}
console.log(`packing from ${src} to ${dest}`);

const baseSrc = path.dirname(src);
const { parse } = require('node-html-parser');
var jsonObj = parse(fs.readFileSync(src).toString());

async function writeDom(node, stream) {
    if (['html', 'head', 'body'].indexOf(node.tagName) >= 0) {
        stream.write(`<${node.tagName}>`)
        for (const child of node.childNodes) {
            await writeDom(child, stream);
        }
        if (node.tagName === 'head') {
            stream.write(`<script>
            function require(){
                return {
                    ipcRenderer: {
                        on: function(){},
                        send: function(){}
                    }
                }
            }
            </script>`);
        }
        stream.write(`</${node.tagName}>`)
    } else if (node.tagName === 'link') {
        const rel = node.attributes['rel'];
        const href = node.attributes['href'];
        switch (rel) {
            case 'icon':
                console.log(`embed icon link: ${node.toString()}`);
                const b64 = await getContent(href, 'base64');
                const rawhref = `data:image/x-icon;base64,${b64}`;
                stream.write(`<link rel="icon" href="${rawhref}">`);
                break;
            case 'preload':
                console.log(`remove preload link: ${node.toString()}`);
                break;
            case 'stylesheet':
                console.log(`embed style link: ${node.toString()}`);
                stream.write(`<style>`)
                stream.write(String.fromCharCode(10));
                stream.write(await getContent(href, 'utf8'));
                stream.write(String.fromCharCode(10));
                stream.write(`</style>`);
                break;
            default:
                break;
        }
    } else if (node.tagName === 'script') {
        const href = node.attributes['src'];
        stream.write(`<script>`)
        stream.write(String.fromCharCode(10));
        stream.write(await getContent(href, 'utf8'));
        stream.write(String.fromCharCode(10));
        stream.write(`</script>`);
    } else {
        stream.write(node.toString());
    }
}

async function embedResources(cssStr, relPath) {
    const urlRegex = /url\((.[^,\(\)]*)\)/g;
    const matches = [];
    while ((arr = urlRegex.exec(cssStr)) !== null) {
        matches.push({
            index: arr['index'],
            url: arr['1'],
            length: arr['0'].length
        });
    }
    const converted = [];
    let pos = 0;
    for (const match of matches) {
        if (!match.url.startsWith('data:')) {
            converted.push(cssStr.substring(pos, match.index));
            pos = match.index;
            const extName = path.extname(trimQuery(match.url));
            if (!fontMime[extName]) {
                console.log()
            }
            const urlHead = `url("data:${fontMime[extName]}; charset=utf-8; base64,`;
            converted.push(urlHead + await getContent(match.url, 'base64', relPath) + '")');
            pos += match.length;
        }
    }
    converted.push(cssStr.substr(pos));
    return converted.join('');
}

function trimQuery(url) {
    const pos = url.indexOf('?');
    return pos === -1 ? url : url.substr(0, pos);
}

async function getContent(href, format, relPath = '') {
    return new Promise((resolve) => {
        let protocol;
        if (href.startsWith('https')) {
            protocol = https;
        } else if (href.startsWith('http')) {
            protocol = http;
        } else {
            const hrefReal = trimQuery(href);
            const fileContent = fs.readFileSync(path.join(baseSrc, relPath, hrefReal));
            if (hrefReal.indexOf('css?') >= 0 || hrefReal.endsWith('.css')) {
                const relativePath = path.dirname(hrefReal);
                embedResources(fileContent.toString(), relativePath).then((converted) => {
                    resolve(converted);
                });
            } else {
                resolve(format === 'base64' ? fileContent.toString(format) : fileContent.toString());
            }
        }
        if (protocol) {
            protocol.get(href, (res) => {
                const { statusCode } = res;
                let error;
                if (statusCode !== 200) {
                    error = new Error('Request Failed.\n' +
                        `Status Code: ${statusCode}`);
                }
                if (error) {
                    console.error(error.message);
                    // Consume response data to free up memory
                    res.resume();
                    return;
                }
                if (format === 'utf8') {
                    res.setEncoding(format);
                }
                let rawData = '';
                let rawBuffers = [];
                res.on('data', (chunk) => {
                    if (format === 'base64') {
                        rawBuffers.push(chunk);
                    } else {
                        rawData += chunk;
                    }
                });
                res.on('end', () => {
                    if (format === 'base64') {
                        resolve(Buffer.concat(rawBuffers).toString(format));
                    } else {
                        if (href.indexOf('css?') >= 0 || href.endsWith('.css')) {
                            embedResources(rawData).then((converted) => {
                                resolve(converted);
                            });
                        } else {
                            resolve(rawData);
                        }
                    }
                });
            }).on('error', (e) => {
                console.error(`Got error: ${e.message}`);
            });
        }
    });
}

const ws = fs.createWriteStream(dest);
writeDom(jsonObj.firstChild, ws).then(() => {
    ws.end();
});
