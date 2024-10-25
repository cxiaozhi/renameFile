const fs = require("fs");
const path = require("path");
const config = require("./config.json");
const basePath = path.join(path.dirname(__dirname),config.basePath );
let fileCount = 0;
let dirCount = 0;

function scanFile(basePath) {
    const pathList = fs.readdirSync(basePath);
    for (let index = 0; index < pathList.length; index++) {
        const fileName = pathList[index];
        const filePath = path.join(basePath, fileName);
        const isDir = fs.statSync(filePath).isDirectory();
        if (isDir) {
            dirCount++;
            scanFile(filePath);
        } else {
            fileCount++;
            if (filePath.includes("Copy")) {
                fs.rmSync(filePath);
            }
        }
    }
}
scanFile(basePath);
console.log("文件数量:%s 目录数量:%s", fileCount, dirCount);
