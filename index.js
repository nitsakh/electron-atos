const fs = require('fs')
const os = require('os')
const path = require('path')
const ChildProcess = require('child_process')

const electronDownload = require('electron-download')
const extractZip = require('extract-zip')
const mapLimit = require('async/mapLimit')

module.exports = (options, callback) => {
  const {version, quiet, file, mas, force} = options
  const platform = options.mas ? 'mas' : 'darwin'
  const directory = path.join(__dirname, 'cache', version + '-' + platform)
  const content = fs.readFileSync(file, 'utf8')

  const addresses = getAddresses(content)

  download({version, quiet, directory, platform, force}, (error) => {
    if (error != null) return callback(error)

    mapLimit(addresses, os.cpus().length, (a, cb) => {
      if (a.symbols != null) {
        cb(null, a.symbols)
      } else {
        const {library, image, addresses} = a
        const libraryPath = getLibraryPath(directory, library)
        symbolicate({library: libraryPath, image, addresses: addresses.map(a => a.address)}).then((symbols) => {
          cb(null, symbols.map((symbol, i) => ({symbol, i: addresses[i].i})))
        })
      }
    }, (err, syms) => {
      if (err) callback(err)
      const concatted = syms.reduce((m, o) => m.concat(o), [])

      let split = content.split('\n')
      concatted.map((sym) => {
        split[sym.i] = sym.symbol
      })
      const parsed = path.parse(file)
      const dest = path.join(parsed.dir, parsed.name + '_symbolicated' + parsed.ext)
      fs.writeFileSync(dest, split.join('\n'))

      callback(null, dest)
    })
  })
}

const download = (options, callback) => {
  const {version, quiet, directory, platform, force} = options

  if (fs.existsSync(directory) && !force) return callback()

  electronDownload({
    version: version,
    dsym: true,
    platform,
    arch: 'x64',
    quiet: quiet,
    force: force
  }, (error, zipPath) => {
    if (error != null) return callback(error)
    extractZip(zipPath, {dir: directory}, callback)
  })
}

const exec = (command, args, stdin) => {
  return new Promise((resolve, reject) => {
    const proc = ChildProcess.spawn(command, args)
    let output = ''
    let error = ''
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output)
      } else {
        error = `${command} exited with ${code}: ${error}`
        reject(new Error(error))
      }
    })
    proc.stdout.on('data', (data) => {
      output += data.toString()
    })
    proc.stderr.on('data', (data) => {
      error += data.toString()
    })
    proc.stdin.write(stdin)
    proc.stdin.end()
  })
}

const symbolicate = async ({library, image, addresses}) => {
  const atos_stdout = await exec('atos', ['-o', library, '-l', image], addresses.join('\n'))
  return atos_stdout.trim().split('\n')
}

const groupBy = (xs, f) => {
  const groups = new Map()
  for (const x of xs) {
    const key = f(x)
    if (!groups.has(key)) { groups.set(key, []) }
    groups.get(key).push(x)
  }
  return Array.from(groups.values())
}

const getAddresses = (content) => {
  const addresses = []
  content.split('\n').forEach((line, i) => {
    const parser = /load address/.test(line) ? parseSamplingAddress : parseAddress
    const a = parser(line)
    if (a) {
      addresses.push({...a, i})
    }
  })
  return groupBy(addresses, a => `${a.library};${a.image}`).map(as => {
    const {library, image} = as[0]
    return library == null
      ? {symbols: as}
      : {library, image, addresses: as}
  })
}

// Lines from stack traces are of the format:
// 0   com.github.electron.framework  0x000000010d01fad3 0x10c497000 + 12094163
// or:
// 13  com.github.electron.framework  0x00000001016ee77f atom::api::WebContents::LoadURL(GURL const&, mate::Dictionary const&) + 831
const parseAddress = (line) => {
  const segments = line.split(/\s+/)
  const index = parseInt(segments[0])
  if (!isFinite(index)) return

  const library = segments[1]
  const address = segments[2]
  const image = segments[3]

  // images are of the format: 0x10eb25000
  if (/0x[0-9a-fA-F]+/.test(image)) {
    return {library, image, address}
  } else {
    return {symbol: segments.slice(3).join(' ')}
  }
}

// Lines from macOS sampling reports are of the format:
// 2189 ???  (in Electron Framework)  load address 0x1052bd000 + 0x3f8e36  [0x1056b5e36]
const parseSamplingAddress = (line) => {
  const isElectron = line.match(/\(in Electron Framework\)/)
  const isNode = line.match(/\(in libnode\.dylib\)/)
  if (!isElectron && !isNode) return

  const addressMatch = line.match(/\[(0x[0-9a-fA-F]+)]/)
  if (!addressMatch) return

  const imageMatch = line.match(/(0x[0-9a-fA-F]+)/)
  if (!imageMatch) return

  const library = isElectron
    ? 'com.github.electron.framework'
    : 'libnode.dylib'
  const address = addressMatch[1]
  const image = imageMatch[1]

  return {library, image, address}
}

const getLibraryPath = (rootDirectory, library) => {
  switch (library) {
    case 'libnode.dylib':
      return path.join(rootDirectory, 'libnode.dylib.dSYM', 'Contents', 'Resources', 'DWARF', 'libnode.dylib')
    default:
      return [
        path.join(rootDirectory, 'Electron Framework.dSYM', 'Contents', 'Resources', 'DWARF', 'Electron Framework'),
        path.join(rootDirectory, 'Electron Framework.framework.dSYM', 'Contents', 'Resources', 'DWARF', 'Electron Framework')
      ].find(fs.existsSync)
  }
}
