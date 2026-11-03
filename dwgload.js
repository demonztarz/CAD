/* Main-process DWG reader: LibreDWG (WebAssembly) -> DraftForge document. */
const path = require('path');
const { convertDatabase } = require('./src/dwgconvert.js');

function wasmDir() {
  const dir = path.join(__dirname, 'node_modules', '@mlightcad', 'libredwg-web', 'wasm');
  // inside a packaged app the .wasm is unpacked next to app.asar
  return dir.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') + path.sep;
}

async function loadDwg(bytes) {
  const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const lib = await LibreDwg.create(wasmDir());
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const dwg = lib.dwg_read_data(ab, Dwg_File_Type.DWG);
  if (!dwg) throw new Error('This DWG file could not be read. It may be corrupt or use an unsupported version.');
  try {
    return convertDatabase(lib.convert(dwg));
  } finally {
    try { lib.dwg_free(dwg); } catch (_) { /* already released */ }
  }
}

module.exports = { loadDwg };
