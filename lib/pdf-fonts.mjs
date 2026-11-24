import 'regenerator-runtime/runtime.js';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** @param {import('pdf-lib').PDFDocument} document @param {{subsetTamil?:boolean}} options */
export async function embedDocumentFonts(document,options={}) {
  document.registerFontkit(fontkit);
  // Existing documents retain full static fonts. Reports explicitly subset the
  // Tamil faces so shaped ligatures also get Unicode extraction mappings.
  // Share each embedded face per PDF; never use the former variable fonts.
  const [latin, tamil, latinBold, tamilBold] = await Promise.all([
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSans.ttf')), { subset: false }),
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSansTamil.ttf')), { subset: options.subsetTamil===true }),
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSans-Bold.ttf')), { subset: false }),
    document.embedFont(await readFile(path.join(process.cwd(),'assets/fonts/NotoSansTamil-Bold.ttf')), { subset: options.subsetTamil===true }),
  ]);
  return { latin, tamil, latinBold, tamilBold };
}
