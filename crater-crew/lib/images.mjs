// Sponsor logo checks. The type comes from the file's magic bytes, never from its name or declared MIME type.
export const MAX_LOGO_BYTES=512*1024;

const TYPES={png:'image/png',jpg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'};

export function sniffImage(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const at=(i,...xs)=>xs.every((x,k)=>b[i+k]===x);
 if(b.length>=8&&at(0,0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return 'png';
 if(b.length>=3&&at(0,0xff,0xd8,0xff))return 'jpg';
 if(b.length>=12&&at(0,0x52,0x49,0x46,0x46)&&at(8,0x57,0x45,0x42,0x50))return 'webp';
 if(looksLikeSvg(b))return 'svg';
 return null;
}

function looksLikeSvg(b){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,Math.min(b.length,4096)))}catch{return false}
 // Optional BOM, XML declaration and comments, then the <svg root element.
 return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
}

// SVG is accepted only when it is plainly static artwork: we reject (rather than try to clean) anything that can
// run script, pull in other documents or resources, or link out. Every href must point inside the file (#id).
const SVG_FORBIDDEN=[
 [/<!doctype|<!entity/i,'DOCTYPE/ENTITY declarations'],
 // Prefixed elements (<s:script>, <h:script>) and extra namespaces would slip past the name checks below.
 [/<\s*\/?\s*[\w.-]+:[\w.-]/,'namespaced elements'],
 [/\sxmlns:(?!xlink\s*=)[\w.-]+\s*=/i,'extra XML namespaces'],
 [/<\s*(script|foreignobject|iframe|embed|object|image|a|use|animate\w*|set|handler|listener|meta|link|base|audio|video|canvas)\b/i,'active or external elements'],
 [/\son[a-z]+\s*=/i,'event handler attributes'],
 [/javascript:|vbscript:|data:/i,'script or data URLs'],
 [/@import/i,'CSS imports'],
 [/url\(\s*['"]?\s*[^'"#\s)]/i,'external url() references'],
];
export function checkSvg(bytes){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return 'SVG must be UTF-8 text'}
 if(!/<\/svg>\s*$/i.test(text))return 'SVG must end with </svg>';
 for(const [re,what] of SVG_FORBIDDEN)if(re.test(text))return `SVG with ${what} is not allowed`;
 for(const m of text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi))if(!m[2].startsWith('#'))return 'SVG links must point inside the file (#id)';
 return null;
}

// Returns {ok:true, ext, contentType} or {ok:false, status, error}.
export function validateLogo(bytes){
 const size=bytes?.byteLength??0;
 if(!size)return {ok:false,status:400,error:'logo file is empty'};
 if(size>MAX_LOGO_BYTES)return {ok:false,status:413,error:`logo is larger than ${MAX_LOGO_BYTES/1024} KB`};
 const ext=sniffImage(bytes);
 if(!ext)return {ok:false,status:415,error:'logo must be a PNG, JPEG, WebP or SVG image'};
 if(ext==='svg'){const e=checkSvg(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));if(e)return {ok:false,status:422,error:e}}
 return {ok:true,ext,contentType:TYPES[ext]};
}
