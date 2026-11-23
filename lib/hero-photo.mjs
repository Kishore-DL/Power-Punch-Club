const defaultPhotos=new Set(['/power-punch-banner.webp','/power-punch-banner-mobile.webp','/karate-cutout.webp','/karate-cutout-mobile.webp','/dojo-rose.webp','/dojo-portrait.webp']);
export function selectedHeroPhoto(value){
  if(typeof value!=='string'||!value.trim())return '';
  const photo=value.trim();
  return defaultPhotos.has(photo.split(/[?#]/)[0])?'':photo;
}
