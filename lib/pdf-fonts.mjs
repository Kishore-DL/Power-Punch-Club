import 'regenerator-runtime/runtime.js';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function embedDocumentFonts(document) {
  document.registerFontkit(fontkit);
  // Full static fonts are compact and avoid the missing glyph outlines that
  // occurred with variable-font subsetting. Share each embedded face per PDF.
  const [latin, tamil, latinBold, tamilBold] = await Promise.all([
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSans.ttf')), { subset: false }),
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSansTamil.ttf')), { subset: false }),
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSans-Bold.ttf')), { subset: false }),
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSansTamil-Bold.ttf')), { subset: false }),
  ]);
  return { latin, tamil, latinBold, tamilBold };
}
