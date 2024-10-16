export interface Preload {
    rel: 'stylesheet' | 'modulepreload' | 'module' | 'preload';
    href: string;

    // preload as
    as?: string;

    // mime type for link preload
    type?: string;

    nonce?: string;

    comment?: string;
    isEntry?: boolean;

    asyncScript?: boolean;
}

export function createHtmlTag({
    rel,
    href,
    as,
    type,
    comment,
    nonce,
    asyncScript,
}: Preload) {
    let tag = comment ? `<!-- ${comment} -->\n` : '';

    const nonceAttr = nonce ? ` nonce="${nonce}"` : '';

    switch (rel) {
        case 'stylesheet':
            tag += `<link rel="stylesheet" href="/${href}" crossorigin${nonceAttr} />`;
            break;
        case 'modulepreload':
            tag += `<link rel="modulepreload" href="/${href}" crossorigin${nonceAttr} />`;
            break;
        case 'module':
            tag += `<script type="module"${asyncScript ? ' async' : ''} src="/${href}" crossorigin${nonceAttr}></script>`;
            break;
        case 'preload':
            const crossorigin = as === 'font' || as === 'fetch';
            tag += `<link rel="preload" href="/${href}" as="${as}" type="${type}"${crossorigin ? ' crossorigin' : ''} />`;
            break;
        default:
            return null;
    }

    return `${tag}\n`;
}

/**
 * Create a combined Link header separated by ,
 */
export function createLinkHeader(modules: Preload[]) {
    return modules.map(createSingleLinkHeader).filter(Boolean).join(', ');
}

/**
 * Creates a single Link header
 */
export function createSingleLinkHeader({ rel, href, as, type }: Preload) {
    switch (rel) {
        case 'module':
        case 'modulepreload':
            return `</${href}>; rel=modulepreload; crossorigin`;
        case 'stylesheet':
            return `</${href}>; rel=preload; as=style; crossorigin`;
        case 'preload':
            const crossorigin = as === 'font' || as === 'fetch';
            return `</${href}>; rel=preload; as=${as}; type=${type}${crossorigin ? '; crossorigin' : ''}`;
        default:
            return null;
    }
}

function linkPriority(module: Preload) {
    switch (module.rel) {
        // Stylesheets have the 'Highest' priority in Chrome
        case 'stylesheet':
            return 5;
        // <script> and <link rel=modulepreload> have the 'High' priority
        case 'module':
            return 3;
        case 'modulepreload':
            return 2;
        case 'preload':
            // Load fonts just below stylesheets. If we don't, there is a higher risk of that the text will flash on the site
            if (module.as === 'font') {
                return 4;
            }
            return 0;
        default:
            return -1;
    }
}

export function sortPreloads(modules: Preload[]) {
    return modules.toSorted((a, b) => {
        return linkPriority(b) - linkPriority(a);
    });
}
