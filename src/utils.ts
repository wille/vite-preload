export interface Module {
    type: 'stylesheet' | 'modulepreload' | 'module';
    href: string;
    comment?: string;
    isEntry?: boolean;
}

export function createHtmlTag({ type, href, comment }: Module) {
    let tag = comment ? `<!-- ${comment} -->\n` : '';

    switch (type) {
        case 'stylesheet':
            tag += `<link rel="stylesheet" crossorigin href="/${href}" nonce="%NONCE%" />`;
            break;
        case 'modulepreload':
            tag += `<link rel="modulepreload" crossorigin href="/${href}" nonce="%NONCE%" />`;
            break;
        case 'module':
            tag += `<script type="module" src="/${href}" crossorigin nonce="%NONCE%"></script>`;
            break;
        default:
            return undefined;
    }

    return `${tag}\n`;
}

export function createLinkHeader({ type, href, comment }: Module) {
    switch (type) {
        case 'modulepreload':
            return `</${href}>; rel=modulepreload; crossorigin`;
        case 'stylesheet':
            return `</${href}>; as=style; rel=preload; crossorigin`;
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
