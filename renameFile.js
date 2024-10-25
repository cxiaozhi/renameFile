const fs = require('fs')
const path = require('path')
const config = require('./config.json')
const { exit } = require('process')
const crypto = require('crypto')
const utils = require('./utils')
const winston = require('winston')
// const basePath = path.join(path.dirname(__dirname), config.basePath);
const basePath = config.basePath

let fileCount = 0 // 统计文件数量
let dirCount = 0 // 统计文件夹数量
const cmd = process.argv[2] // 操作命令 1.拷贝文件 2.替换文件 3.删除多余文件
const allFilePath = [] // 所有文件路径
const extNameList = ['.prefab', '.fire', '.js', '.png', '.jpg', '.jpeg', '.anim', '.fnt'] // 要处理的文件类型

// 创建一个 logger 实例
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    // - 将日志信息输出日志文件
    new winston.transports.File({ filename: 'debug.log', level: 'info' })
  ]
})

/**
 * 拷贝函数
 * @param {*} filePath 文件路径
 * @returns
 */
function copyFile (filePath) {
  const ext = path.extname(filePath) // 后缀名
  const oldName = path.basename(filePath, ext)
  if (!oldName.startsWith(config.prefix) && !oldName.endsWith(config.suffix) && extNameList.includes(ext)) {
    if (!isNaN(Number(oldName)) && ext === '.js') {
      logger.info('跳过文件: ' + oldName)
      return
    }
    const newName = config.prefix + oldName + config.suffix + ext
    const newfilePath = path.join(path.dirname(filePath), newName)
    if (fs.existsSync(newfilePath)) {
      logger.info('文件已存在: ' + newfilePath)
    } else {
      fs.copyFileSync(filePath, newfilePath)
    }
  }
}

/**
 * 保存元数据
 */
function saveMetaData (filePath) {
  const ext = path.extname(filePath) // 后缀名
  const oldName = path.basename(filePath, ext)
  if (!oldName.startsWith(config.prefix) && !oldName.endsWith(config.suffix) && extNameList.includes(ext)) {
    if (!isNaN(Number(oldName)) && ext === '.js') {
      logger.info('跳过文件: ' + oldName)
      return
    }
    const newName = config.prefix + oldName + config.suffix + ext
    const old_className = oldName
    const new_className = config.prefix + oldName + config.suffix
    const newfilePath = path.join(path.dirname(filePath), newName)
    const newMetaFilePath = newfilePath + '.meta'
    const oldMetaFilePath = path.join(filePath + '.meta')
    const oldMetaContent = fs.readFileSync(oldMetaFilePath, 'utf-8')
    const newMetaContent = fs.readFileSync(newMetaFilePath, 'utf-8')
    if (!fs.existsSync(newMetaFilePath)) {
      logger.info('meta文件不存在: ' + newMetaFilePath)
      return
    }
    let new_uuid, old_uuid, old_rawTextureUuid, new_rawTextureUuid
    if (ext == '.js') {
      old_uuid = utils.compressUuid_Test(JSON.parse(oldMetaContent).uuid)
      new_uuid = utils.compressUuid_Test(JSON.parse(newMetaContent).uuid)
    } else if (ext == '.png' || ext == '.jpg' || ext == '.jpeg') {
      old_uuid = JSON.parse(oldMetaContent).subMetas[old_className].uuid
      new_uuid = JSON.parse(newMetaContent).subMetas[new_className].uuid
      old_rawTextureUuid = JSON.parse(oldMetaContent).subMetas[old_className].rawTextureUuid
      new_rawTextureUuid = JSON.parse(newMetaContent).subMetas[new_className].rawTextureUuid
    } else if (ext == '.prefab' || ext == '.fire' || ext == '.anim' || ext == '.fnt') {
      old_uuid = JSON.parse(oldMetaContent).uuid
      new_uuid = JSON.parse(newMetaContent).uuid
    } else {
      console.log(ext + '未处理UUID--->old_uuid:%s new_uuid:%s', JSON.parse(oldMetaContent).uuid, JSON.parse(newMetaContent).uuid)
    }
    if (old_uuid && new_uuid) {
      allFilePath.push({ newfilePath, oldFilePath: filePath, old_uuid, new_uuid, new_className, old_className, old_rawTextureUuid, new_rawTextureUuid })
    }
  }
}

/**
 * 扫描所有文件
 * @param {*} basePath
 */
function scanFile (basePath, callback) {
  const pathList = fs.readdirSync(basePath)
  for (let index = 0; index < pathList.length; index++) {
    const fileName = pathList[index]
    const filePath = path.join(basePath, fileName)
    const isDir = fs.statSync(filePath).isDirectory()
    if (isDir) {
      if (fileName != 'spine') {
        dirCount++
        scanFile(filePath, callback)
      }
    } else {
      fileCount++
      callback(filePath)
    }
  }
}

/**
 * 替换场景或预制体对资源的引用
 * @param {*} filePath 文件路径
 * @returns
 */
function replacePrefab (filePath) {
  const ext = path.extname(filePath)
  const oldName = path.basename(filePath, ext)
  if (oldName.startsWith(config.prefix) && oldName.endsWith(config.suffix)) {
    const oldContent = fs.readFileSync(filePath, 'utf-8')
    let newContent = oldContent
    const oldHash = crypto.createHash('sha256').update(oldContent).digest('hex')
    for (let index = 0; index < allFilePath.length; index++) {
      const element = allFilePath[index]
      const new_uuid = element.new_uuid
      const old_uuid = element.old_uuid
      const newReg = new RegExp(utils.escapeRegExp(new_uuid), 'g')
      const oldReg = new RegExp(utils.escapeRegExp(old_uuid), 'g')
      if (oldReg.test(newContent) && !newReg.test(newContent)) {
        newContent = newContent.replace(oldReg, new_uuid)
      }
    }
    const newHash = crypto.createHash('sha256').update(newContent).digest('hex')
    if (oldHash !== newHash) {
      // 如果内容发生变化，则写入文件
      fs.writeFileSync(filePath, newContent, 'utf-8')
      logger.info('文件:' + filePath + ' UUID已替换')
    } else {
      logger.info('文件:' + filePath + ' 内容无变化')
    }
  }
}

/**
 * 替换文字中图片引用
 * @param {*} filePath
 */
function replaceFnt (filePath) {
  const tempext = path.extname(filePath)
  const tempOldName = path.basename(filePath, tempext)
  const ext = path.extname(tempOldName)
  const oldName = path.basename(tempOldName, ext)
  if (oldName.startsWith(config.prefix) && oldName.endsWith(config.suffix)) {
    const oldContent = fs.readFileSync(filePath, 'utf-8')
    let newContent = oldContent
    const oldHash = crypto.createHash('sha256').update(oldContent).digest('hex')
    for (let index = 0; index < allFilePath.length; index++) {
      const element = allFilePath[index]
      const new_rawTextureUuid = element.new_rawTextureUuid
      const old_rawTextureUuid = element.old_rawTextureUuid
      if (new_rawTextureUuid && old_rawTextureUuid) {
        const newReg = new RegExp(utils.escapeRegExp(new_rawTextureUuid), 'g')
        const oldReg = new RegExp(utils.escapeRegExp(old_rawTextureUuid), 'g')
        // if (old_rawTextureUuid == "9f8c66db-4721-4ac9-98c1-e2f0c477cb25") {
        //     console.log(new_rawTextureUuid, old_rawTextureUuid, newContent);
        //     exit();
        // }
        if (oldReg.test(newContent) && !newReg.test(newContent)) {
          newContent = newContent.replace(oldReg, new_rawTextureUuid)
        }
      }
    }
    const newHash = crypto.createHash('sha256').update(newContent).digest('hex')
    if (oldHash !== newHash) {
      // 如果内容发生变化，则写入文件
      fs.writeFileSync(filePath, newContent, 'utf-8')
      logger.info('文件:' + filePath + ' UUID已替换')
    } else {
      logger.info('文件:' + filePath + ' 内容无变化')
    }
  }
}

/**
 * 替换js文件中的类名
 * @param {*} filePath
 */
function replaceJSClassName (filePath) {
  const ext = path.extname(filePath) // 后缀名
  const oldName = path.basename(filePath, ext)
  if (oldName.startsWith(config.prefix) && oldName.endsWith(config.suffix)) {
    const oldContent = fs.readFileSync(filePath, 'utf-8')
    let newContent = oldContent
    const oldHash = crypto.createHash('sha256').update(oldContent).digest('hex')
    for (let index = 0; index < allFilePath.length; index++) {
      const element = allFilePath[index]
      const old_className = `("${element.old_className}")`
      const new_className = `("${element.new_className}")`
      const oldReg = new RegExp(utils.escapeRegExp(old_className), 'g')
      const newReg = new RegExp(utils.escapeRegExp(new_className), 'g')
      if (!newReg.test(newContent)) {
        newContent = newContent.replace(oldReg, new_className)
      }
    }
    const newHash = crypto.createHash('sha256').update(newContent).digest('hex')
    if (oldHash !== newHash) {
      // 如果内容发生变化，则写入文件
      fs.writeFileSync(filePath, newContent, 'utf-8')
      logger.info('文件:' + filePath + ' 类名已替换')
    } else {
      logger.info('文件:' + filePath + ' 内容无变化')
    }
  }
}

// 替换资源
function replaceAssets (filePath) {
  const ext = path.extname(filePath)
  if (ext === '.prefab' || ext === '.fire' || ext === '.anim') {
    replacePrefab(filePath)
  } else if (ext === '.js') {
    replaceJSClassName(filePath)
  } else if (filePath.includes('.fnt') && filePath.includes('.meta')) {
    replaceFnt(filePath) // 替换文字图片引用
  }
}

/**
 * 开始拷贝
 */
function startCopy () {
  logger.info('开始扫描文件')
  scanFile(basePath, copyFile)
  logger.info('扫描结束，共扫描到' + fileCount + '个文件，' + dirCount + '个文件夹')
  fileCount = 0
  dirCount = 0
}

/**
 * 开始替换
 */
function startReplace () {
  logger.info(allFilePath.length + '个文件需要替换')
  logger.info('开始替换文件', '开始扫描文件')
  scanFile(basePath, replaceAssets)
  logger.info('替换结束', '扫描结束，共扫描到' + fileCount + '个文件，' + dirCount + '个文件夹')
}

/**
 * 删除多余文件
 */
function deleteExtraFile (filePath) {
  let ext = path.extname(filePath) // 后缀名

  let oldName = path.basename(filePath, ext) // 文件名
  if (ext == '.meta') {
    const secondExt = path.extname(oldName)
    oldName = path.basename(oldName, secondExt)
    ext = secondExt + ext
  }
  if (oldName.startsWith(config.prefix) && oldName.endsWith(config.suffix)) return
  const copyFileName = config.prefix + oldName + config.suffix
  const copyFilePath = path.join(path.dirname(filePath), copyFileName + ext)
  if (!fs.existsSync(copyFilePath)) return
  console.log('副本文件存在', copyFilePath)
  fs.unlinkSync(filePath)
  logger.info('文件已删除: ' + filePath)
  console.log('删除成功:' + filePath)
}

/**
 * 主函数
 */
function main () {
  switch (cmd) {
    case '1':
      startCopy()
      break
    case '2':
      scanFile(basePath, saveMetaData)
      startReplace()
      break
    case '3':
      scanFile(basePath, deleteExtraFile)
      break
    default:
      console.log('error: 命令无效!!!')
      console.log('操作命令:\n1->拷贝文件\n2->替换文件\n3->删除多余文件')
      break
  }
}
main()
