import test from 'tape'
import fs from 'fs'
import crypto from 'crypto'
import zlib from 'zlib'
import request from 'supertest'
import Koa from 'koa'
import http from 'http'
import path from 'path'
import staticCache from './src'

const jsType = 'application/javascript; charset=utf-8'
const correctStatus = (s) => `has ${s} status`
const is200 = correctStatus(200)
const is404 = correctStatus(404)
const is304 = correctStatus(304)
const correctHeader = (s) => `has correct ${s}`
const correctCC = correctHeader('cache-control')
const correctCT = correctHeader('content-type')
const correctCL = correctHeader('content-length')
const correctLM = correctHeader('last-modified')
const correctET = correctHeader('etag')
const correctGZ = correctHeader('gzip')
const correctV = correctHeader('vary')

test('it should accept abnormal path', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: path.resolve(__dirname) }))
  const server = http.createServer(app.callback())

  request(server)
    .get('//src/index.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.end()
    })
})

let etag
test('it should serve files', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/src/index.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.equal(res.header['cache-control'], 'public, max-age=0', correctCC)
      t.equal(res.header['content-type'], jsType, correctCT)
      t.ok(res.header['content-length'], correctCL)
      t.ok(res.header['last-modified'], correctLM)
      t.ok(res.header['etag'], correctET)
      etag = res.headers.etag
      t.end()
    })
})

test('it should serve files as buffers', (t) => {
  const app = new Koa()
  app.use(staticCache({
    dir: '.',
    buffer: true
  }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/src/index.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.equal(res.header['cache-control'], 'public, max-age=0', correctCC)
      t.equal(res.header['content-type'], jsType, correctCT)
      t.ok(res.header['content-length'], correctCL)
      t.ok(res.header['last-modified'], correctLM)
      t.ok(res.header['etag'], correctET)
      etag = res.headers.etag
      t.end()
    })
})

test('it should serve recursive files', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/src/index.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.equal(res.header['cache-control'], 'public, max-age=0')
      t.equal(res.header['content-type'], jsType, correctCT)
      t.ok(res.header['content-length'], correctCL)
      t.ok(res.header['last-modified'], correctLM)
      t.ok(res.header['etag'], correctET)
      t.end()
    })
})

test('it should not serve hidden files', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/.gitignore')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 404, is404)
      t.end()
    })
})

test('it should support conditional HEAD requests', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .head('/src/index.js')
    .set('If-None-Match', etag)
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 304, is304)
      t.end()
    })
})

test('it should support conditional GET requests', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/src/index.js')
    .set('If-None-Match', etag)
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 304, is304)
      t.end()
    })
})

test('it should support HEAD', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .head('/src/index.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.deepEqual(res.body, {}, 'has empty body')
      t.end()
    })
})

test('it should support 404 Not Found for other Methods to allow downstream', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .put('/src/index.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 404, is404)
      t.end()
    })
})

test('it should ignore query strings', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/src/index.js?query=string')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.end()
    })
})

test('it should set the etag and content-md5 headers', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  const pk = fs.readFileSync('package.json')
  const md5 = crypto.createHash('md5').update(pk).digest('base64')

  request(server)
    .get('/package.json')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.equal(res.header['etag'], `"${md5}"`, correctET)
      t.equal(res.header['content-md5'], md5, correctHeader('content-md5'))
      t.end()
    })
})

test('it should serve files with gzip buffer', (t) => {
  const app = new Koa()
  app.use(staticCache({
    dir: '.',
    buffer: true,
    gzip: true
  }))
  const server = http.createServer(app.callback())

  const index = fs.readFileSync('src/index.js')
  zlib.gzip(index, (err, content) => {
    if (err) throw err
    request(server)
      .get('/src/index.js')
      .set('Accept-Encoding', 'gzip')
      .end((err, res) => {
        if (err) throw err
        t.deepEqual(res.status, 200, is200)
        t.ok(index.toString())
        t.equal(res.header['vary'], 'Accept-Encoding', correctV)
        t.equal(res.header['content-length'], `${content.length}`, correctCL)
        t.equal(res.header['content-encoding'], 'gzip', correctGZ)
        t.equal(res.header['cache-control'], 'public, max-age=0', correctCC)
        t.equal(res.header['content-type'], jsType, correctCT)
        t.ok(res.header['content-length'], correctCL)
        t.ok(res.header['last-modified'], correctLM)
        t.ok(res.header['etag'], correctET)
        etag = res.headers.etag
        t.end()
      })
  })
})

test('it should not serve files with gzip buffer when accept encoding not include gzip', (t) => {
  const app = new Koa()
  app.use(staticCache({
    dir: '.',
    buffer: true,
    gzip: true
  }))
  const server = http.createServer(app.callback())

  const index = fs.readFileSync('src/index.js')
  request(server)
    .get('/src/index.js')
    .set('Accept-Encoding', '')
    .end((err, res) => {
      if (err) throw err
      t.equal(res.header['content-type'], jsType)
      t.deepEqual(res.status, 200, is200)
      t.ok(index.toString(), 'has index')
      t.equal(res.header['cache-control'], 'public, max-age=0', correctCC)
      t.equal(res.header['content-length'], `${index.length}`, correctCL)
      t.notOk(res.header['content-encoding'], correctHeader('content-encoding'))
      t.ok(res.header['content-length'], correctCL)
      t.ok(res.header['last-modified'], correctLM)
      t.ok(res.header['etag'], correctET)
      t.end()
    })
})

test('it should serve files with gzip stream', (t) => {
  const app = new Koa()
  app.use(staticCache({
    dir: '.',
    gzip: true
  }))
  const server = http.createServer(app.callback())

  const index = fs.readFileSync('src/index.js')
  zlib.gzip(index, (err, content) => {
    if (err) throw err
    request(server)
      .get('/src/index.js')
      .set('Accept-Encoding', 'gzip')
      .end((err, res) => {
        if (err) throw err
        t.equal(res.header['content-type'], jsType, correctCT)
        t.equal(res.header['content-encoding'], 'gzip', correctGZ)
        t.deepEqual(res.status, 200, is200)
        t.ok(index.toString(), 'index is ok')
        t.equal(res.header['cache-control'], 'public, max-age=0', correctCC)
        t.ok(res.header['last-modified'], correctLM)
        t.ok(res.header['etag'], correctET)
        t.equal(res.header['vary'], 'Accept-Encoding', correctV)
        etag = res.headers.etag
        t.end()
      })
  })
})

test('it should work fine when new file added', (t) => {
  fs.writeFileSync('a.js', 'hello world')
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/a.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      fs.unlinkSync('a.js')
      t.end()
    })
})

test('it should 404 when new hidden file added', (t) => {
  fs.writeFileSync('.a.js', 'hello world')
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/.a.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 404, is404)
      fs.unlinkSync('.a.js')
      t.end()
    })
})

test('it should 404 when file not exist', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/a.js')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 404, is404)
      t.end()
    })
})

test('it should 404 when is folder without index.html', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/src')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 404, is404)
      t.end()
    })
})

test('it should fall back to index.html if available', (t) => {
  fs.writeFileSync('index.html', 'hello world')
  const app = new Koa()
  app.use(staticCache({ dir: '.' }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 200, is200)
      t.deepEqual(res.text, 'hello world', 'has correct text')
      fs.unlinkSync('index.html')
      t.end()
    })
})

test('it should not load files above options.dir', (t) => {
  const app = new Koa()
  app.use(staticCache({ dir: path.resolve(__dirname, 'src') }))
  const server = http.createServer(app.callback())

  request(server)
    .get('/%2E%2E/package.json')
    .end((err, res) => {
      if (err) throw err
      t.deepEqual(res.status, 404, is404)
      t.end()
    })
})
