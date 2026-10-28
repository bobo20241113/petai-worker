// FastGPT v4.14.5 reclassifies fileUrlList by URL filename, not HTTP Content-Type.
// Ref: packages/global/common/file/tools.ts::parseUrlToFileType at v4.14.5.
const EXTENSIONS={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export function imageExtension(mime){const ext=EXTENSIONS[mime];if(!ext)throw new Error('UNSUPPORTED_IMAGE_MIME');return ext}
export function imageObjectPath(owner,conversation,attachment,mime){return `${owner}/${conversation}/${attachment}.${imageExtension(mime)}`}
export function signedImageUrl(projectUrl,signedUrl,mime){
 if(typeof signedUrl!=='string'||!signedUrl.startsWith('/')||signedUrl.startsWith('//'))throw new Error('INVALID_SIGNED_IMAGE_URL');
 const base=new URL(projectUrl);const path=signedUrl.startsWith('/storage/v1/')?signedUrl:'/storage/v1'+signedUrl;
 const url=new URL(path,base.origin);
 if(url.origin!==base.origin||!url.pathname.startsWith('/storage/v1/object/sign/petai-private/'))throw new Error('INVALID_SIGNED_IMAGE_URL');
 // Existing objects have no extension. FastGPT explicitly supports ?filename=.
 // This does not change the signed object path or token.
 url.searchParams.set('filename','petai-image.'+imageExtension(mime));
 return url.href;
}
