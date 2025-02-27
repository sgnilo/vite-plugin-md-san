/**
 * @file markdown compile
 * @author Sheeta(wuhayao@gmail.com)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {marked} from 'marked';
import {parseCodeLang} from './query';

type ExportType = 'html' | 'component';

interface ComponentSnippets {
    // import xxx from 'yyy';
    import: string;
    // 'xxx': xxx
    component: string;
}

interface TemplateData {
    id: string | number;
    // escaped code
    code: string;
    componentRequest: string;
    caption?: string;
    sourceList: string;
    metadata: string;
    filepath: string
}

interface Alias {
    find: RegExp | string;
    replacement: string;
}

interface Source {
    filename: string;
    type: string;
    code: string;
}

interface CompileOptions {
    filepath: string;
    alias?: Alias[];
    exportType?: ExportType;
    template?: string | Function;
}

const defaultTemplate = path.join(__dirname, './theme/default.template');
let templateContent: string | Function = fs.readFileSync(defaultTemplate, {encoding: 'utf8'});
let file: string;
let exportType: ExportType;
let index: number;
let alias: Alias[];
let previewBlocks: Map<string, string>;
const components: ComponentSnippets[] = [];

function init(options: CompileOptions) {
    file = options.filepath;
    exportType = options.exportType || 'html';
    templateContent = options.template || templateContent;
    index = 1;
    alias = options.alias || [];
    components.splice(0, components.length);
    previewBlocks = new Map();
}

const md5 = (content: string) => crypto.createHash('md5').update(content).digest('hex').substring(0, 7);

const renderer = {
    code(code: string, infostring: string) {
        const codeEsc = code
            .replace(/</g, '&lt;')
            .replace(/`/g, '&#96;');

        const codeLang = parseCodeLang(infostring);
        if (
            exportType === 'component'
            && codeLang.lang === 'san'
            && codeLang.export === 'preview'
        ) {

            const cssImports = codeEsc.match(/('|")[^('|")]+\.(css|less|scss)+('|")/g) || [];
            const sourceList: Source[] = [{filename: 'index.ts', code: codeEsc, type: 'ts'}];
            const mdPath = file.replace(/\/[^\/]+\.md$/, '');

            cssImports.forEach(css => {
                const fileName = css.replace(/('|")/g, '');
                const absolutePath = alias.reduce(
                    (prev: string, curr: Alias) => prev.replace(curr.find, curr.replacement),
                    fileName);
                let sourceCode = '';
                try {
                    sourceCode = fs.readFileSync(path.resolve(mdPath, absolutePath), {encoding: 'utf8'});
                } catch (err) {};
                sourceList.push({
                    filename: fileName,
                    code: sourceCode,
                    type: 'css'
                });
            });
            const codeMd5 = md5(code);
            const id = `${index}_${codeMd5}`;
            const entryTag = `preview-block-${index}-${codeMd5}`;
            const entryVar = `PreviewBlock${id}`;
            const mapKeyEntry = `${entryVar}.vpms`;
            const mapKeyComponent = `Component${id}.vpms`;
            // /src/markdown/html.md.PreviewBlock1.vpms
            const entryRequest = `${file}.${mapKeyEntry}`;
            // /src/markdown/html.md.Component1.vpms
            const componentRequest = `${file}.${mapKeyComponent}`;
            components.push({
                import: `import ${entryVar} from '${entryRequest}'`,
                component: `'${entryTag}': ${entryVar}`
            });
            previewBlocks.set(mapKeyEntry, getTemplate({
                id,
                code: codeEsc,
                filepath: file,
                componentRequest,
                caption: codeLang.caption,
                sourceList: JSON.stringify(sourceList),
                metadata: JSON.stringify(codeLang)
            }));
            previewBlocks.set(mapKeyComponent, code);
            index++;

            return `<${entryTag}></${entryTag}>`;
        }

        return `<pre><code class="language-san">${codeEsc}</code></pre>`;
    }
};

marked.use({renderer});

export function compile(raw: string, compileOptions: CompileOptions) {
    init(compileOptions);

    const html = marked.parse(raw);
    if (compileOptions.exportType === 'html') {
        return {
            html
        };
    }

    const entryComponent = `import {Component} from 'san';
${components.map(item => item.import).join(';\n')};
export default class ComponentDoc extends Component {
    static template = \`<section class=\"markdown\">${html}</section>\`;
    static components = {
        ${components.map(item => item.component).join(',\n\t\t')}
    };
};
`;

    return {
        entryComponent,
        previewBlocks
    }
}

function getTemplate(data: TemplateData) {
    let template: any = templateContent;
    if (typeof template === 'function') {
        template = template(data);
    }
    let key: keyof TemplateData;
    for (key in data) {
        const value = ('' + data[key]) ?? '';
        // <%=id=%>
        template = template.split(new RegExp(`<%=\\s*${key}\\s*=%>`, 'g')).join(value);
    }
    return template;
}
