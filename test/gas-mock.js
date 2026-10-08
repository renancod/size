// Simulador mínimo dos serviços do Google Apps Script usados pelo backend, para testar localmente.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function criarGAS() {
  let seq = 0;
  const novoId = p => p + (++seq).toString(36).padStart(6, '0');
  const enviados = [], threads = [];
  const planilhas = {}, pastas = {}, arquivos = {}, props = {};

  const bytes = buf => Array.from(buf);
  const toBuf = d => Buffer.isBuffer(d) ? d : Array.isArray(d) ? Buffer.from(d.map(b => b & 255)) : Buffer.from(String(d), 'utf8');
  function Blob(data, mime, name) { this._b = toBuf(data == null ? '' : data); this._m = mime || 'application/octet-stream'; this._n = name || 'arquivo'; }
  Blob.prototype.getBytes = function () { return bytes(this._b); };
  Blob.prototype.getDataAsString = function () { return this._b.toString('utf8'); };
  Blob.prototype.setName = function (n) { this._n = n; return this; };
  Blob.prototype.getName = function () { return this._n; };
  Blob.prototype.getContentType = function () { return this._m; };
  Blob.prototype.copyBlob = function () { return new Blob(this._b, this._m, this._n); };
  Blob.prototype.getSize = function () { return this._b.length; };

  function Range(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  Range.prototype.getValues = function () {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sh.d[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); }
      out.push(o);
    }
    return out;
  };
  Range.prototype.setValues = function (v) {
    if (v.length !== this.nr || v.some(r => r.length !== this.nc)) throw new Error('setValues: dimensões erradas');
    v.forEach((row, i) => { const rr = this.sh.d[this.r - 1 + i] = this.sh.d[this.r - 1 + i] || []; row.forEach((x, j) => { rr[this.c - 1 + j] = x; }); });
    return this;
  };
  Range.prototype.setValue = function (x) { return this.setValues([[x]]); };
  Range.prototype.setFontWeight = function () { return this; };

  function Sheet(ss, nome) { this.ss = ss; this.nome = nome; this.d = []; }
  Sheet.prototype.getName = function () { return this.nome; };
  Sheet.prototype.setFrozenRows = function () { return this; };
  Sheet.prototype.getLastRow = function () { for (let i = this.d.length - 1; i >= 0; i--) if (this.d[i] && this.d[i].some(x => x !== '' && x != null)) return i + 1; return 0; };
  Sheet.prototype.getLastColumn = function () { let m = 0; this.d.forEach(r => { if (!r) return; for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { if (r < 1 || c < 1 || (nr || 1) < 1 || (nc || 1) < 1) throw new Error('getRange inválido ' + [r, c, nr, nc]); return new Range(this, r, c, nr || 1, nc || 1); };
  Sheet.prototype.deleteRow = function (l) { this.d.splice(l - 1, 1); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };

  function SS(nome) { this.id = novoId('ss'); this.nome = nome; this.abas = [new Sheet(this, 'Página1')]; planilhas[this.id] = this; arquivos[this.id] = { id: this.id, nome, mime: 'sheet', pai: null }; }
  SS.prototype.getId = function () { return this.id; };
  SS.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; };
  SS.prototype.getSheetByName = function (n) { return this.abas.find(s => s.nome === n) || null; };
  SS.prototype.getSheets = function () { return this.abas.slice(); };
  SS.prototype.insertSheet = function (n) { const s = new Sheet(this, n); this.abas.push(s); return s; };
  SS.prototype.deleteSheet = function (s) { this.abas = this.abas.filter(x => x !== s); };

  function Folder(nome, pai) { this.id = novoId('fo'); this.nome = nome; this.pai = pai; pastas[this.id] = this; }
  Folder.prototype.getId = function () { return this.id; };
  Folder.prototype.getUrl = function () { return 'https://drive.google.com/drive/folders/' + this.id; };
  Folder.prototype.createFolder = function (n) { return new Folder(n, this.id); };
  Folder.prototype.getFoldersByName = function (n) { return iter(Object.values(pastas).filter(f => f.pai === this.id && f.nome === n)); };
  Folder.prototype.createFile = function (blob) { const f = new File(blob, this.id); return f; };
  Folder.prototype.getFiles = function () { const l = Object.values(arquivos).filter(a => a.pai === this.id && a.blob); return { hasNext: () => l.length > 0, next: () => l.shift() }; };
  Folder.prototype.getFilesByName = function (n) { const l = Object.values(arquivos).filter(a => a.pai === this.id && a.nome === n); return { hasNext: () => l.length > 0, next: () => l.shift() }; };
  function File(blob, pai) { this.id = novoId('fi'); this.nome = blob.getName(); this.blob = blob; this.mime = blob.getContentType(); this.pai = pai; arquivos[this.id] = this; }
  File.prototype.getId = function () { return this.id; };
  File.prototype.getName = function () { return this.nome; };
  File.prototype.getUrl = function () { return 'https://drive.google.com/file/d/' + this.id + '/view'; };
  File.prototype.getBlob = function () { return this.blob.copyBlob(); };
  File.prototype.getMimeType = function () { return this.mime; };
  File.prototype.getSize = function () { return this.blob.getSize(); };
  File.prototype.moveTo = function (f) { this.pai = f.id; return this; };

  const iter = l => ({ hasNext: () => l.length > 0, next: () => l.shift() });
  const pad = n => String(n).padStart(2, '0');

  const G = {
    SpreadsheetApp: {
      create: n => new SS(n),
      openById: id => { const s = planilhas[id]; if (!s) throw new Error('Planilha não encontrada: ' + id); return s; }
    },
    DriveApp: {
      createFolder: n => new Folder(n, null),
      getFolderById: id => { const f = pastas[id]; if (!f) throw new Error('Pasta não encontrada'); return f; },
      getFoldersByName: n => iter(Object.values(pastas).filter(f => f.nome === n)),
      getFileById: id => {
        const f = arquivos[id];
        if (!f) throw new Error('Arquivo não encontrado');
        if (!f.moveTo) f.moveTo = function (p) { this.pai = p.id; return this; };
        return f;
      }
    },
    GmailApp: {
      sendEmail: (para, assunto, corpo, op) => { enviados.push({ para, assunto, html: op && op.htmlBody, anexos: (op && op.attachments || []).length }); },
      search: () => threads.slice()
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      formatDate: (d, tz, f) => f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())),
      computeDigest: (alg, s) => bytes(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
      computeHmacSha256Signature: (v, k) => bytes(crypto.createHmac('sha256', k).update(v).digest()),
      base64Encode: d => toBuf(d).toString('base64'),
      base64EncodeWebSafe: d => toBuf(d).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: s => bytes(Buffer.from(s, 'base64')),
      base64DecodeWebSafe: s => bytes(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      newBlob: (d, m, n) => new Blob(d, m, n),
      getUuid: () => crypto.randomUUID(),
      sleep: () => {}
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo', getEffectiveUser: () => ({ getEmail: () => 'adm@sizeengenhariaambiental.com.br' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => { const b = { timeBased: () => b, everyMinutes: () => b, everyDays: () => b, atHour: () => b, create: () => {} }; return b; } },
    Logger: { log: (...a) => G._logs.push(a.join(' ')) },
    _logs: [], _enviados: enviados, _threads: threads, _planilhas: planilhas, _arquivos: arquivos, Blob
  };
  G.console = console;

  const ctx = vm.createContext(G);
  const dir = path.join(__dirname, '..', 'backend');
  const ordem = ['Main.gs', 'Db.gs', 'Pedidos.gs', 'Estoque.gs', 'Admin.gs', 'Setup.gs', 'Email.gs', 'Fornecedor.gs', 'Notificacoes.gs', 'Execucao.gs', 'Retroativos.gs'];
  const codigo = ordem.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
  vm.runInContext(codigo, ctx, { filename: 'backend.gs' });
  ctx.chamar = q => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(q) } }).getContent());
  ctx.rodar = src => vm.runInContext(src, ctx);
  return ctx;
}

module.exports = { criarGAS };
