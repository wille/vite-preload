export interface Module {
    type: 'stylesheet' | 'modulepreload' | 'module';
    href: string;
    comment?: string;
}

export function createHtmlTag({ type, href, comment }: Module) {
    let tag = comment ? `<!-- ${comment} -->\n` : '';

    switch (type) {
        case 'stylesheet':
            tag += `<link rel=stylesheet crossorigin href="/${href}" nonce="%NONCE%" />`;
            break;
        case 'modulepreload':
            tag += `<link rel="modulepreload" href="/${href}" nonce="%NONCE%" />`;
            break;
        case 'module':
            tag += `<script type="module" src="/${href}" nonce="%NONCE%"></script>`;
            break;
        default:
            return undefined;
    }

    return `${tag}\n`;
}

export function createLinkHeader({ type, href, comment }: Module) {
    switch (type) {
        case 'modulepreload':
            return `</${href}>; rel="modulepreload"`;
        case 'stylesheet':
            return `</${href}>; rel="stylesheet"`;
        default:
            return undefined;
    }
}

export function sortPreloadModules(modules: Module[]) {
    return modules.toSorted((a, b) => {
        switch (a.type) {
            case 'stylesheet':
                return 1;
            case 'module':
                return -1;
            default:
                return 0;
        }
    });
}
