const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const previewDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hindi-preview-test-'));
const previewFile = path.join(previewDirectory, 'progress.json');
const savedFile = path.resolve(__dirname, '../progress/sparsh-rssb-v1.json');
const original = fs.readFileSync(savedFile);
process.env.PROGRESS_FILE = previewFile;
const storage = require('../api/_db');

(async () => {
  try {
    const empty = await storage.getProgress('preview-test');
    assert.deepEqual(empty.stars, {});
    const fixture = { ...empty, stars: { 'preview-only': 4 } };
    await storage.saveProgress('kalpesh', fixture);
    assert.deepEqual(await storage.getProgress('another-user'), fixture);
    assert.deepEqual(fs.readFileSync(savedFile), original);
    console.log('Preview storage is isolated from saved user progress.');
  } finally {
    if (fs.existsSync(previewFile)) fs.unlinkSync(previewFile);
    fs.rmdirSync(previewDirectory);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
