const assert = require('assert')
const atos = require('..')
const fs = require('fs')
const path = require('path')

const {describe, it} = global

describe('atos', function () {
  after(() => {
    output_files.map((file) => fs.unlinkSync(file))
  })

  this.timeout(60000)

  const fixtures = path.join(__dirname, 'fixtures')
  let output_files = []
  it('returns an array of symbols for an Electron framework address', (done) => {
    atos({
      file: path.join(fixtures, 'framework-addresses.txt'),
      version: '1.4.14'
    }, (error, output) => {
      if (error != null) return done(error)

      output_files.push(output)
      assert.equal(fs.readFileSync(output, 'utf8').trim(), fs.readFileSync(path.join(fixtures, 'framework-symbols.txt'), 'utf8').trim())
      done()
    })
  })

  it('returns an array of symbols for a node address', (done) => {
    atos({
      file: path.join(fixtures, 'node-addresses.txt'),
      version: '1.4.14'
    }, (error, output) => {
      if (error != null) return done(error)

      output_files.push(output)
      assert.equal(fs.readFileSync(output, 'utf8').trim(), fs.readFileSync(path.join(fixtures, 'node-symbols.txt'), 'utf8').trim())
      done()
    })
  })

  it('returns an array of symbols for partially symbolicated addresses', (done) => {
    atos({
      file: path.join(fixtures, 'mixed-addresses.txt'),
      version: '1.4.14'
    }, (error, output) => {
      if (error != null) return done(error)

      output_files.push(output)
      assert.equal(fs.readFileSync(output, 'utf8').trim(), fs.readFileSync(path.join(fixtures, 'mixed-symbols.txt'), 'utf8').trim())
      done()
    })
  })

  it('returns an array of symbols for addresses taken from sampling', (done) => {
    atos({
      file: path.join(fixtures, 'sampling-addresses.txt'),
      version: '1.6.8'
    }, (error, output) => {
      if (error != null) return done(error)

      output_files.push(output)
      assert.equal(fs.readFileSync(output, 'utf8').trim(), fs.readFileSync(path.join(fixtures, 'sampling-symbols.txt'), 'utf8').trim())
      done()
    })
  })
})
