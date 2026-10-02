import * as bs from 'brighterscript';
import * as path from 'path';

const jsCommentStartRegex = /^[\s]*(?:\/\*+)?[\s]*(.*)/g;
const bsMeaningfulCommentRegex = /^[\s]*(?:'|REM)[\s]*\**[\s]*(.*)/g;
const paramRegex = /@param\s+(?:{([^}]*)})?\s+(?:\[(\w+).*\]|(\w+))[\s\-\s|\s]*(.*)/;
const paramRegexNoType = /@param\s+(?:\[(\w+).*\]|(\w+))[\s\-\s|\s]*(.*)/;
const returnRegex = /@returns?\s*({(?:[^}]*)})?\s*(.*)/;
const extendsRegex = /@extends/;
const moduleRegex = /@module ([^\*\s]+)/;
const escapeCharEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&apos;'
};

const typeGetOptions: bs.GetTypeOptions = { flags: bs.SymbolTypeFlag.typetime };

/**
 * Converts BrightScript hex literal tokens (`&hFF`) to valid JS literal syntax (`0xFF`) so
 * jsdoc's parser doesn't choke on the raw BrightScript source text.
 */
function normalizeBrightScriptNumericLiteral(value: string): string {
    return value.replace(/&([Hh])([0-9A-Fa-f]+)/g, '0x$2');
}


interface PluginOptions {
    addModule?: boolean;
    escapeHTMLCharacters?: boolean;
}

function getOptions() {
    const opts = global.env?.opts || {};
    const pluginOpts: PluginOptions = opts['brighterscript-jsdocs-plugin'] || {};

    if (pluginOpts.addModule === undefined || pluginOpts.addModule === null) {
        pluginOpts.addModule = true;
    }

    if (pluginOpts.escapeHTMLCharacters === undefined || pluginOpts.escapeHTMLCharacters === null) {
        pluginOpts.escapeHTMLCharacters = false;
    }
    return pluginOpts;
}

const namespacesCreated: string[] = [];
const modulesCreated: string[] = [];

export function resetCreatedCache() {
    namespacesCreated.length = 0;
    modulesCreated.length = 0;
}

let parserLines: string[] = [];

/**
 * Gets the original source text of a node, with any line breaks collapsed to single spaces
 */
function getSourceText(node?: bs.AstNode): string {
    const range = node?.location?.range;
    if (!range) {
        return '';
    }
    const lines = parserLines.slice(range.start.line, range.end.line + 1);
    if (lines.length === 0) {
        return '';
    }
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, range.end.character);
    lines[0] = lines[0].slice(range.start.character);
    return lines.map(line => line.trim()).filter(line => line).join(' ');
}

/**
 * Gets the type name for the given type
 * Defaults to "dynamic" if it can't decide
 * Handles BrighterScript v1 compound types (unions, intersections) and typed arrays,
 * since those collapse to generic runtime types (`dynamic`/`object`) via toTypeString()
 */
function getTypeName(type?: bs.BscType): string {
    if (!type) {
        return 'dynamic';
    }
    if (bs.isArrayType(type)) {
        // Prefer the raw, unresolved element type over `defaultType`, since resolving
        // an element type that references another class/interface (eg. `Person[]`) without a
        // full Program forces it to `dynamic` instead of leaving it as an inspectable ReferenceType
        const elementType = type.innerTypes?.length === 1 ? type.innerTypes[0] : type.defaultType;
        return `Array.<${getTypeName(elementType)}>`;
    }
    if (bs.isUnionType(type)) {
        const memberNames = (type.types ?? []).map(memberType => getTypeName(memberType));
        return `(${memberNames.join('|')})`;
    }
    if (bs.isIntersectionType(type)) {
        // JSDoc's (Closure-style) type grammar has no intersection-type operator, only union (`|`),
        // so an `&`-joined type string here would parse as a real union member and crash real jsdoc
        // generation. Fall back to `dynamic`, matching how BrighterScript itself transpiles this type.
        return 'dynamic';
    }
    if (bs.isClassType(type) || bs.isInterfaceType(type) || bs.isEnumType(type) || bs.isComponentType(type) || bs.isNamespaceType(type)) {
        return type.name;
    }
    if (bs.isReferenceType(type)) {
        // Type names that reference another class/interface/namespace can't be resolved to a concrete
        // type without a full Program (this plugin only lexes/parses one file at a time), so BrighterScript
        // hands back an unresolved ReferenceType. Its `fullName` is the name as written in the source.
        return type.fullName;
    }
    if (type.toTypeString) {
        return type.toTypeString();
    }
    return 'dynamic';
}

/**
 * Gets the node whose leading trivia holds the doc comment for a statement.
 * If the statement has annotations, the comment appears before the first annotation,
 * not before the statement itself.
 */
function getCommentTriviaOwner(node: bs.AstNode): bs.AstNode {
    const annotations = (node as { annotations?: bs.AnnotationExpression[] }).annotations;
    if (annotations && annotations.length > 0) {
        return annotations[0];
    }
    return node;
}

/**
 * Gets the raw text (including the leading `'`/`REM` marker) of each comment line
 * directly preceding the given AST node.
 *
 * `leadingTrivia` returns every comment since the previous real token, which can include
 * unrelated blocks separated by a blank line, or another statement's trailing same-line comment.
 * Only the contiguous run of comment lines immediately (no gap) above the node counts as its
 * doc comment - matching the adjacency BrightScriptDoc comments have always required.
 */
function getCommentLines(node?: bs.AstNode): string[] {
    if (!node) {
        return [];
    }
    const owner = getCommentTriviaOwner(node);
    const trivia = owner.leadingTrivia ?? [];
    const commentTokens = trivia.filter(token => token.kind === bs.TokenKind.Comment);
    if (!commentTokens.length) {
        return [];
    }

    let startIndex = commentTokens.length - 1;
    for (let i = commentTokens.length - 2; i >= 0; i--) {
        const currentLine = commentTokens[i].location?.range?.start?.line;
        const nextLine = commentTokens[i + 1].location?.range?.start?.line;
        if (currentLine === undefined || nextLine === undefined || currentLine !== nextLine - 1) {
            break;
        }
        startIndex = i;
    }
    const contiguousCommentTokens = commentTokens.slice(startIndex);

    const lastCommentLine = contiguousCommentTokens[contiguousCommentTokens.length - 1].location?.range?.start?.line;
    const ownerStartLine = owner.location?.range?.start?.line;
    if (lastCommentLine === undefined || ownerStartLine === undefined || lastCommentLine + 1 !== ownerStartLine) {
        return [];
    }

    return contiguousCommentTokens.map(token => token.text);
}

/**
 * Gets the stripped text (marker removed) of just the first comment line preceding the given node
 * Used for one-line descriptions, eg. class/interface field descriptions
 */
function getSingleLineComment(node?: bs.AstNode): string {
    const [firstLine] = getCommentLines(node);
    return firstLine ? firstLine.replace(bsMeaningfulCommentRegex, '$1') : '';
}

/**
 * Helper to clean up param or return description strings
 *
 */
function paramOrReturnDescriptionHelper(desc = '') {
    desc = (desc || '').trim();
    if (desc.startsWith('-')) {
        return desc;
    }
    if (desc.startsWith(',')) {
        desc = desc.substring(1);
    }
    if (desc) {
        return desc;
    }
    return '';
}

function getMemberOf(moduleName = '', namespaceName = '') {
    const memberOf = namespaceName || moduleName;
    const memberType = namespaceName ? '' : 'module:';
    if (memberOf) {
        return ` * @memberof! ${memberType}${memberOf.replace(/\./g, '/')}`;
    }
    return '';
}


function getModuleLineComment(moduleName = '') {
    const modifiedModuleName = moduleName.replace(/\./g, '/');
    if (!modifiedModuleName || modulesCreated.includes(modifiedModuleName)) {
        return '';
    }
    modulesCreated.push(modifiedModuleName);
    return [`/**`, ` * @module ${modifiedModuleName}`, ` */`].join('\n');
}

/**
 * Escapes HTML special characters in a string
 *
 * @param line input string
 * @returns  the same string with HTML special characters escaped
 */
function escapeHTMLCharacters(line: string) {
    let outLine = line;
    for (const char in escapeCharEntities) {
        outLine = outLine.replace(new RegExp(char, 'g'), escapeCharEntities[char]);
    }
    return outLine;
}


/**
 * Convert a node's leading doc comment to Js Doc Lines
 * This will return a string[] with each line of a block comment
 * But - it does not include comment closing tag (ie. asterisk-slash)
 *
 * @returns Array of comment lines in JSDoc format -
 */
function convertCommentTextToJsDocLines(commentLines: string[] = []) {
    const output = ['/**'];
    output.push(...commentLines.map(line => {
        return line.replace(bsMeaningfulCommentRegex, '$1');
    }).map(line => line.trim())
        .filter((line) => {
            return !line.includes('@module');
        }).map((line, i) => {
            if (i === 0) {
                line = line.replace(jsCommentStartRegex, '$1');
            }
            line = line.replace(/\*+\/\s*/g, '');
            if (getOptions().escapeHTMLCharacters) {
                line = escapeHTMLCharacters(line);
            }
            return ' * ' + line;
        }));
    return output;
}

/**
 * Processes a function or a class method
 * For class methods, the "new()" function is outputed as "constructor()"
 *
 * @param func the actual function or class method
 * @param moduleName [moduleName=""] the module name this function is in
 * @param namespaceName [namespaceName=""] the namespace this function is in
 * @returns the jsdoc string for the function provided
 */
function processFunction(func: bs.FunctionStatement | bs.InterfaceMethodStatement | bs.MethodStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];
    let commentLines = convertCommentTextToJsDocLines(getCommentLines(func));
    const paramNameList: string[] = [];
    const params = bs.isInterfaceMethodStatement(func) ? func.params : func.func.parameters;
    let returnTypeExpression = bs.isInterfaceMethodStatement(func) ? func.returnTypeExpression : func.func.returnTypeExpression;
    let isSub = false;
    if (bs.isInterfaceMethodStatement(func)) {
        isSub = func.tokens.functionType?.kind === bs.TokenKind.Sub;
    } else {
        isSub = func.func.tokens.functionType?.kind === bs.TokenKind.Sub;
    }
    commentLines.push(` * @function`);
    let containerName = ''; // name of the class or interface that contains this function
    if (bs.isMethodStatement(func) || bs.isInterfaceMethodStatement(func)) {
        containerName = (func.parent as (bs.ClassStatement | bs.InterfaceStatement))?.getName?.(bs.ParseMode.BrighterScript);
    }

    // Find the param line in the comments that match each param
    for (const param of params) {
        let paramName = param.tokens.name.text;
        paramNameList.push(paramName);
        let paramType = getTypeName(param.getType(typeGetOptions));
        let paramDescription = '';

        // remove @param lines for the current param
        commentLines = commentLines.filter(commentLine => {
            let commentMatch = paramRegex.exec(commentLine);
            if (commentMatch) {

                const commentParamName = (commentMatch[2] || commentMatch[3]) || '';
                const commentParamType = commentMatch[1] || '';

                if (paramName.trim().toLowerCase() === commentParamName.trim().toLowerCase()) {
                    // same parameter name - use these details
                    if (commentParamType) {
                        paramType = commentParamType.trim();
                        paramDescription = commentMatch[4] || paramDescription;
                    }
                    return false;
                }
            } else {
                commentMatch = paramRegexNoType.exec(commentLine);
                if (commentMatch) {
                    const commentParamName = (commentMatch[1] || commentMatch[2]) || '';
                    if (paramName.trim().toLowerCase() === commentParamName.trim().toLowerCase()) {
                        // same parameter name - use these details
                        paramDescription = commentMatch[3] || paramDescription;
                        return false;
                    }
                }
            }
            return true;
        });

        let paramLine = ` * @param {${paramType}} `;
        if (param.defaultValue?.location?.range) {
            paramLine += `[${paramName}=${getSourceText(param.defaultValue)}]`;
        } else {

            paramLine += paramName;
        }

        if (paramDescription) {
            paramLine += ` ${paramOrReturnDescriptionHelper(paramDescription)}`;
        }
        output.push(paramLine);
    }

    if (bs.isMethodStatement(func)) {
        if (func.tokens.name.text.startsWith('_') || func.accessModifier?.kind === bs.TokenKind.Private) {
            output.push(' * @access private');
        } else if (func.accessModifier?.kind === bs.TokenKind.Protected) {
            output.push(' * @access protected');
        }
        if (func.tokens.override) {
            output.push(` * @override`);
        }
    }
    const returnTypeString = isSub ? 'void' : getTypeName(returnTypeExpression?.getType(typeGetOptions));
    let returnLine = ` * @returns {${returnTypeString}}`;
    // Find the return line in the comments
    for (let i = 0; i < commentLines.length; i++) {
        let commentMatch = returnRegex.exec(commentLines[i]);
        if (commentMatch) {
            let commentReturnType = returnTypeString;
            if (commentMatch[1] && commentMatch[1].trim().toLowerCase() === commentReturnType.toLowerCase()) {
                // there is a return type given, and it matches the type of the function
                commentReturnType = commentMatch[1].trim();
            }
            returnLine = ` * @returns {${commentReturnType}}`;
            if (commentMatch[2]) {
                returnLine += ' ' + paramOrReturnDescriptionHelper(commentMatch[2]);
            }
            // remove the original comment @returns line
            commentLines.splice(i, 1);
        }
    }


    const totalOutput = [...commentLines, ...output];
    const memberLine = getMemberOf(moduleName, namespaceName);
    if (memberLine) {
        totalOutput.push(memberLine);
    }

    const funcName = bs.isInterfaceMethodStatement(func) ? func.tokens.name.text : func.tokens.name.text;
    let funcDeclaration = `function ${funcName} (${paramNameList.join(', ')}) { }; \n`;
    if (bs.isInterfaceMethodStatement(func)) {
        const iFaceName = (func.parent as bs.InterfaceStatement)?.name;
        totalOutput.push(returnLine);
        funcDeclaration = `${iFaceName}.prototype.${funcName} = function(${paramNameList.join(', ')}) { }; \n`;
    } else if (bs.isMethodStatement(func)) {

        if (funcName.toLowerCase() === 'new') {
            totalOutput.push(' * @constructor');
            if (containerName) {
                totalOutput.push(` * @returns {${containerName}}`);
            }
            funcDeclaration = `constructor(${paramNameList.join(', ')}) { }; \n`;
        } else {
            totalOutput.push(returnLine);
            funcDeclaration = `${funcName} (${paramNameList.join(', ')}) { }; \n`;
        }
    } else {
        totalOutput.push(returnLine);
    }

    totalOutput.push(' */');

    totalOutput.push(funcDeclaration);
    if (namespaceName && bs.isFunctionStatement(func)) {
        totalOutput.push(`${namespaceName}.${funcName} = ${funcName}; `);
    }

    return totalOutput.join('\n');
}

/**
 * Processed a Class Field
 * These are added as property tags in the class's jsdoc comment
 * Private fields are ignored
 *
 * @param field the field to process
 * @returns the property tag for the class this field is in
 */
function processClassField(field: bs.FieldStatement) {
    if (field.tokens.accessModifier?.kind === bs.TokenKind.Private) {
        return '';
    }
    if (!field.tokens.name) {
        return '';
    }
    const description = getSingleLineComment(field);
    return ` * @property {${getTypeName(field.getType(typeGetOptions))}} ${field.tokens.name.text} ${description} `;
}

/**
 * Processed an Interface Field
 * These are added as property tags in the interface's jsdoc comment
 *
 * @param field the field to process
 * @returns the property tag for the interface this field is in
 */
function processInterfaceField(field: bs.InterfaceFieldStatement) {
    if (!field.tokens.name) {
        return '';
    }
    const description = getSingleLineComment(field);
    return ` * @property {${getTypeName(field.getType(typeGetOptions))}} ${field.tokens.name.text} ${description} `;
}


/**
 * Processes a class
 * Classes can have member fields (properties or member methods)
 * Note: the new() method is renamed to constructor()
 *
 * @param klass the actual class statement
 * @param moduleName [moduleName=""] the module name this class is in
 * @param namespaceName [namespaceName=""] the namespace this class is in
 * @returns {string} the jsdoc string for the class provided
 */
function processClass(klass: bs.ClassStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];

    let commentLines = convertCommentTextToJsDocLines(getCommentLines(klass));

    let extendsLine = ''; let parentName = '';
    if (klass.parentClassName) {
        parentName = klass.parentClassName.getName(bs.ParseMode.BrighterScript);
        extendsLine = ` * @extends ${parentName} `;
    }

    for (let i = 0; i < commentLines.length; i++) {
        let commentMatch = extendsRegex.exec(commentLines[i]);
        if (commentMatch?.[1]) {
            commentLines.splice(i, 1);
            break;
        }
    }
    if (extendsLine) {
        commentLines.push(extendsLine);
    }
    // get properties
    const memberOfLine = getMemberOf(moduleName, namespaceName);
    if (memberOfLine) {
        commentLines.push(memberOfLine);
    }
    klass.fields.forEach(field => {
        commentLines.push(processClassField(field));
    });

    commentLines.push(' */');
    output.push(...commentLines);

    const klassName = klass.tokens.name.text;
    if (parentName) {
        output.push(`class ${klassName} extends ${parentName} {\n`);
    } else {
        output.push(`class ${klassName} {\n`);
    }

    klass.methods.forEach(method => {
        output.push(processFunction(method));
    });

    output.push('}\n');
    if (namespaceName) {
        output.push(`${namespaceName}.${klassName} = ${klassName}; `);
    }
    return output.join('\n');
}

/**
 * Processes a namespace.
 * Namespaces are recursive - they can contain other functions, classes or namespaces
 *
 * @param namespace the actual namespace statement
 * @param moduleName [moduleName=""] the module name this namespace is in
 * @param parentNamespaceName [parentNamespaceName=""] the namespace this namespace is in
 * @returns the jsdoc string for the namespace provided
 */
function processNamespace(namespace: bs.NamespaceStatement, moduleName = '', parentNamespaceName = ''): string {

    const output: string[] = [];
    const namespaceParts = namespace.name.split('.');
    const namespaceNames: string[] = [];
    let namespaceNameChain = '';
    for (const namespacePart of namespaceParts) {
        if (namespaceNameChain.length > 0) {
            namespaceNameChain += '.';
        }
        namespaceNameChain += namespacePart;
        namespaceNames.push(namespaceNameChain);
    }
    let index = 0;
    for (const namespaceName of namespaceNames) {
        let subNamespace = namespaceName;
        if (parentNamespaceName) {
            subNamespace = parentNamespaceName + '.' + namespaceName;
        }
        if (!namespacesCreated.includes(subNamespace.toLowerCase())) {
            // have not created this namespace yet
            let commentLines = convertCommentTextToJsDocLines(getCommentLines(namespace));
            commentLines.push(` * @global`);
            commentLines.push(` * @namespace ${subNamespace.replace(/\./g, '/')}`);
            if (subNamespace.includes('.')) {
                commentLines.push(` * @alias ${subNamespace}`);
            }
            commentLines.push(' */');

            output.push(...commentLines);

            if (parentNamespaceName || index > 0) {
                output.push(`${subNamespace} = {};\n`);
            } else {
                output.push(`var ${subNamespace} = {};\n`);
            }
            namespacesCreated.push(subNamespace.toLowerCase());
        }
        index++;
    }
    let totalNamespace = namespace.name;
    if (parentNamespaceName) {
        totalNamespace = parentNamespaceName + '.' + totalNamespace;
    }
    output.push(processStatements(namespace.body.statements, moduleName, totalNamespace));
    return output.join('\n');
}

function processEnum(enumStatement: bs.EnumStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];
    let commentLines = convertCommentTextToJsDocLines(getCommentLines(enumStatement));
    const memberOfLine = getMemberOf(moduleName, namespaceName);
    if (memberOfLine) {
        commentLines.push(memberOfLine);
    }
    commentLines.push(' * @readonly');
    commentLines.push(' * @enum');
    commentLines.push(' */');
    output.push(...commentLines);
    if (namespaceName) {
        output.push(`${namespaceName}.${enumStatement.name} = {`);
    } else {
        output.push(`var ${enumStatement.name} = {`);
    }
    for (const enumMember of enumStatement.getMembers()) {
        const memberCommentLines = getCommentLines(enumMember);
        if (memberCommentLines.length) {
            output.push(...convertCommentTextToJsDocLines(memberCommentLines), ' */');
        }
        output.push(`${enumMember.name}: ${normalizeBrightScriptNumericLiteral(enumMember.getValue())},`);
    }
    output.push('};');

    return output.join('\n');
}

function processConst(constStatement: bs.ConstStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];
    let commentLines = convertCommentTextToJsDocLines(getCommentLines(constStatement));
    const memberOfLine = getMemberOf(moduleName, namespaceName);
    if (memberOfLine) {
        commentLines.push(memberOfLine);
    }
    commentLines.push(' * @readonly');
    commentLines.push(' * @constant');
    // Literals are emitted as JS so jsdoc infers the default; anything else (eg. `1.0 / 30.0`) may not
    // be valid JS, so put its source text on the @default tag instead
    let valueOutput = 'undefined';
    if (bs.isLiteralExpression(constStatement.value)) {
        commentLines.push(' * @default');
        valueOutput = normalizeBrightScriptNumericLiteral(constStatement.value.tokens.value.text);
    } else {
        commentLines.push(` * @default ${getSourceText(constStatement.value).replace(/\*\//g, '*\\/')}`);
    }
    commentLines.push(' */');
    output.push(...commentLines);
    output.push(`var ${constStatement.name} = ${valueOutput};`);

    if (namespaceName) {
        output.push(`${namespaceName}.${constStatement.name} = ${constStatement.name};`);
    }

    return output.join('\n');
}

function processInterface(iface: bs.InterfaceStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];

    let commentLines = convertCommentTextToJsDocLines(getCommentLines(iface));
    const ifaceName = iface.name;
    commentLines.push(` * @interface`);
    let extendsLine = ''; let parentName = '';
    if (iface.parentInterfaceName) {
        parentName = iface.parentInterfaceName.getName(bs.ParseMode.BrighterScript);
        extendsLine = ` * @extends ${parentName} `;
    }

    for (let i = 0; i < commentLines.length; i++) {
        let commentMatch = extendsRegex.exec(commentLines[i]);
        if (commentMatch?.[1]) {
            commentLines.splice(i, 1);
            break;
        }
    }
    if (extendsLine) {
        commentLines.push(extendsLine);
    }
    // get properties
    const memberOfLine = getMemberOf(moduleName, namespaceName);
    if (memberOfLine) {
        commentLines.push(memberOfLine);
    }
    for (const field of iface.fields) {
        if (bs.isInterfaceFieldStatement(field)) {
            commentLines.push(processInterfaceField(field));
        }
    }
    commentLines.push(' */');
    output.push(...commentLines);
    output.push(`function ${ifaceName}() { }; \n`);

    for (const method of iface.methods) {
        if (bs.isInterfaceMethodStatement(method)) {
            output.push(processFunction(method, '', ''));
        }
    }

    if (namespaceName) {
        output.push(`${namespaceName}.${ifaceName} = ${ifaceName}; `);
    }
    return output.join('\n');
}


/**
 * Process bright(er)script statements. Handles functions, namespace or class statements
 * Namespaces are recursive - they can contain other functions, classes or namespaces
 *
 * @param statements an array of statements
 * @param moduleName [moduleName=""] the module name these statements are in
 * @param  namespaceName [namespaceName=""] the namespace these statements are in
 * @returns the jsdoc string for the statements provided
 */
function processStatements(statements: bs.Statement[], moduleName = '', namespaceName = '') {

    const output: string[] = [];

    for (const statement of statements) {
        if (bs.isFunctionStatement(statement)) {
            output.push(processFunction(statement, moduleName, namespaceName));
        } else if (bs.isClassStatement(statement)) {
            output.push(processClass(statement, moduleName, namespaceName));
        } else if (bs.isNamespaceStatement(statement)) {
            output.push(processNamespace(statement, moduleName, namespaceName));
        } else if (bs.isEnumStatement(statement)) {
            output.push(processEnum(statement, moduleName, namespaceName));
        } else if (bs.isConstStatement(statement)) {
            output.push(processConst(statement, moduleName, namespaceName));
        } else if (bs.isInterfaceStatement(statement)) {
            output.push(processInterface(statement, moduleName, namespaceName));
        }
    }

    return output.join('\n');
}



export function convertBrighterscriptDocs(source: string, parseMode: bs.ParseMode = bs.ParseMode.BrighterScript, moduleName = '') {
    parserLines = source.split('\n');
    const parserOptions: bs.ParseOptions = { mode: parseMode };

    const lexResult = bs.Lexer.scan(source);
    const parser = new bs.Parser();
    const parseResult = parser.parse(lexResult.tokens, parserOptions);
    const statements = parseResult.ast.statements;

    // Add our module to the top of the file if it doesn't exist. If it does find out the name

    const output: string[] = [];
    if (moduleName && getOptions().addModule) {
        output.push(getModuleLineComment(moduleName));
    }
    output.push(processStatements(statements, moduleName));

    return output.join('\n');
}

export function getModuleName(filename: string, source: string) {
    const moduleMatch = moduleRegex.exec(source);
    let moduleName = '';
    if (getOptions().addModule) {
        if (moduleMatch) {
            moduleName = moduleMatch[1];
        } else {
            moduleName = path.parse(filename).name.split('.')[0].replace(/\./g, '_');
        }
    }
    return moduleName;
}

export const handlers = {
    beforeParse: (e: { source: string; filename: string }) => {
        parserLines = e.source.split('\n');
        const fileExt = path.extname(e.filename);
        let parseMode = bs.ParseMode.BrightScript;
        if (fileExt.toLowerCase() === '.bs') {
            parseMode = bs.ParseMode.BrighterScript;
        }
        const moduleName = getModuleName(e.filename, e.source);
        const result = convertBrighterscriptDocs(e.source, parseMode, moduleName);
        e.source = result;
        // console.log(e.source)
    }
};
