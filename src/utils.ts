import path from 'node:path';

import mime from 'mime';

export interface Preload {
    rel: 'stylesheet' | 'modulepreload' | 'module' | 'preload';
    href: string;
    comment?: string;
    isEntry?: boolean;
}

function getLinkType(file: string) {
    const mimeType = mime.getType(file);
    if (!mimeType) {
        return null;
    }

    const as = mimeType.split('/')[0];

    switch (as) {
        case 'font':
        case 'image':
            return { as, type: mimeType };
        default:
            return null;
    }
}

export function createHtmlTag({ rel, href, comment }: Preload) {
    let tag = comment ? `<!-- ${comment} -->\n` : '';

    switch (rel) {
        case 'stylesheet':
            tag += `<link rel="stylesheet" href="/${href}" crossorigin nonce="%NONCE%" />`;
            break;
        case 'modulepreload':
            tag += `<link rel="modulepreload" href="/${href}" crossorigin nonce="%NONCE%" />`;
            break;
        case 'module':
            tag += `<script type="module" src="/${href}" crossorigin nonce="%NONCE%"></script>`;
            break;
        case 'preload':
            const linkType = getLinkType(href);
            if (!linkType) {
                return null;
            }
            tag += `<link rel="preload" href="${href}" as="${linkType.as}" type="${linkType.type}" />`;
            break;
        default:
            return null;
    }

    return `${tag}\n`;
}

export function createLinkHeader(modules: Preload[]) {
    return modules.map(createSingleLinkHeader).filter(Boolean).join(', ');
}

export function createSingleLinkHeader({ rel, href }: Preload) {
    switch (rel) {
        case 'module':
        case 'modulepreload':
            return `</${href}>; rel=modulepreload; crossorigin`;
        case 'stylesheet':
            return `</${href}>; rel=preload; as=style; crossorigin`;
        case 'preload':
            const linkType = getLinkType(href);
            if (!linkType) {
                return null;
            }
            return `</${href}>; rel=preload; as=${linkType.as}; type=${linkType.type}`;
        default:
            return null;
    }
}

function linkPriority(module: Preload) {
    switch (module.rel) {
        case 'stylesheet':
            return 3;
        case 'module':
            return 2;
        case 'modulepreload':
            return 1;
        default:
            return -1;
    } 
}

export function sortPreloadModules(modules: Preload[]) {
    return modules.toSorted((a, b) => {
        return linkPriority(a) - linkPriority(b);
    });
}
