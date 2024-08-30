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
        pluginOpts.escapeHTMLCharacters = true;
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
 * Groups Statements into comments, functions, classes and namespaces
 */
function getComments(statements: bs.Statement[]) {
    const comments: bs.CommentStatement[] = statements.filter(bs.isCommentStatement);
    return comments;
}

/**
 * Gets the type name for the given type
 * Defaults to "dynamic" if it can't decide
 */
function getTypeName(type?: { name?: string; toTypeString?: () => string }) {
    if (!type) {
        return 'dynamic';
    }
    if (bs.isCustomType(type)) {
        return type.name;
    }
    if (type.toTypeString) {
        return type.toTypeString();
    }
    return 'dynamic';
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

/**
 * Finds the comment that ends the line above the given statement
 * If the statement has annotations, the comment should be BEFORE the annotations
 *
 * @param comments List of comments to search
 * @param  stmt The statement in question
 * @returns  the correct comment, if found, otherwise undefined
 */
function getCommentForStatement(comments: bs.CommentStatement[], stmt: bs.Statement) {
    return comments.find((comment) => {
        const commentEndLine = comment.range?.end.line;
        let targetStartLine = stmt.range?.start.line;
        if (stmt.annotations && stmt.annotations.length > 0) {
            targetStartLine = stmt.annotations[0].range.start.line;
        }
        if (!commentEndLine) {
            return false;
        }
        return commentEndLine + 1 === targetStartLine || commentEndLine === stmt.range?.start.line;
    });
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
 * Convert a comment statement text to Js Doc Lines
 * This will return a string[] with each line of a block comment
 * But - it does not include comment closing tag (ie. asterisk-slash)
 *
 * @returns Array of comment lines in JSDoc format -
 */
function convertCommentTextToJsDocLines(comment?: bs.CommentStatement) {
    const commentLines = ['/**'];
    if (comment?.text) {
        // Replace brighterscript comment format with jsdoc - eg.
        //   '  Comment here
        // to
        //  * Comment here
        commentLines.push(...comment.text.split('\n').map((line, i) => {
            return line.replace(bsMeaningfulCommentRegex, '$1');
        }).map(line => line.trim())
            .filter((line) => {
                return !line.includes('@module');
            }).map((line, i, lines) => {
                if (i === 0) {
                    line = line.replace(jsCommentStartRegex, '$1');
                }
                line = line.replace(/\*+\/\s*/g, '');
                if (getOptions().escapeHTMLCharacters) {
                    line = escapeHTMLCharacters(line);
                }
                return ' * ' + line;
            }));
    }
    return commentLines;
}

/**
 * Helper function to display a statement for debugging
 * (Not used)
 */
export function displayStatement(stmt: bs.Statement) {
    if (stmt instanceof bs.CommentStatement) {
        console.log(`Comment`);
    } else if (stmt instanceof bs.FunctionStatement) {
        console.log(`Function`);
    } else if (stmt instanceof bs.ClassStatement) {
        console.log(`Class`);
    } else if (stmt instanceof bs.NamespaceStatement) {
        console.log(`Namespace`);
    } else if (stmt instanceof bs.MethodStatement) {
        console.log(`Method`);
    } else if (stmt instanceof bs.FieldStatement) {
        console.log(`Field`);
    } else if (stmt.constructor) {
        console.log(`${stmt.constructor.toString()}`);
    }
    if ((stmt as any).text) {
        console.log((stmt as any).text);
    }
    if ((stmt as any).tokens.text) {
        console.log((stmt as any).tokens.text);
    }
    console.log(`Range:`, stmt.range);
}

/**
 * Processes a function or a class method
 * For class methods, the "new()" function is outputed as "constructor()"
 *
 * @param comment The comment appearing above this function in bs/brs code
 * @param func the actual function or class method
 * @param moduleName [moduleName=""] the module name this function is in
 * @param namespaceName [namespaceName=""] the namespace this function is in
 * @returns the jsdoc string for the function provided
 */
function processFunction(comment: bs.CommentStatement | undefined, func: bs.FunctionStatement | bs.InterfaceMethodStatement | bs.MethodStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];
    let commentLines = convertCommentTextToJsDocLines(comment);
    const paramNameList: string[] = [];
    const params = bs.isInterfaceMethodStatement(func) ? func.params : func.func.parameters;
    let returnType = bs.isInterfaceMethodStatement(func) ? func.returnType : func.func.returnType;
    let isSub = false;
    if (bs.isInterfaceMethodStatement(func)) {
        isSub = func.tokens.functionType?.kind === bs.TokenKind.Sub;
    } else {
        isSub = func.func.functionType?.kind === bs.TokenKind.Sub;
    }
    commentLines.push(` * @function`);
    let containerName = ''; // name of the class or interface that contains this function
    if (bs.isMethodStatement(func) || bs.isInterfaceMethodStatement(func)) {
        containerName = (func.parent as (bs.ClassStatement | bs.InterfaceStatement))?.getName?.(bs.ParseMode.BrighterScript);
    }

    // Find the param line in the comments that match each param
    for (const param of params) {
        let paramName = param.name.text;
        paramNameList.push(paramName);
        let paramType = getTypeName(param.type);
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
        if (param.defaultValue?.range) {
            let start = param.defaultValue.range.start;
            let end = param.defaultValue.range.end;
            let defaultValue = parserLines[start.line].slice(start.character, end.character);
            paramLine += `[${paramName}=${defaultValue}]`;
        } else {

            paramLine += paramName;
        }

        if (paramDescription) {
            paramLine += ` ${paramOrReturnDescriptionHelper(paramDescription)}`;
        }
        output.push(paramLine);
    }

    if (bs.isMethodStatement(func)) {
        if (func.name.text.startsWith('_') || func.accessModifier?.kind === bs.TokenKind.Private) {
            output.push(' * @access private');
        } else if (func.accessModifier?.kind === bs.TokenKind.Protected) {
            output.push(' * @access protected');
        }
        if (func.override) {
            output.push(` * @override`);
        }
    }
    const returnTypeString = isSub ? 'void' : getTypeName(returnType);
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

    const funcName = bs.isInterfaceMethodStatement(func) ? func.tokens.name.text : func.name.text;
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
 * @param {bs.CommentStatement} comment the comment in the line above this field
 * @param {bs.FieldStatement} field the field to process
 * @returns {string} the property tag for the class this field is in
 */
function processClassField(comment: bs.CommentStatement | undefined, field: bs.FieldStatement) {
    if (field.accessModifier?.kind === bs.TokenKind.Private) {
        return '';
    }
    if (!field.name) {
        return '';
    }
    let description = '';
    if (comment) {
        description = comment.text.replace(bsMeaningfulCommentRegex, '$1');
    }
    return ` * @property {${getTypeName(field.getType())}} ${field.name.text} ${description} `;
}

/**
 * Processed a Class Field
 * These are added as property tags in the class's jsdoc comment
 * Private fields are ignored
 *
 * @param {bs.CommentStatement} comment the comment in the line above this field
 * @param {bs.FieldStatement} field the field to process
 * @returns {string} the property tag for the class this field is in
 */
function processInterfaceField(comment: bs.CommentStatement | undefined, field: bs.InterfaceFieldStatement) {
    if (!field.tokens.name) {
        return '';
    }
    let description = '';
    if (comment) {
        description = comment.text.replace(bsMeaningfulCommentRegex, '$1');
    }
    return ` * @property {${field.tokens.type.text}} ${field.tokens.name.text} ${description} `;
}


/**
 * Processes a class
 * Classes can have member fields (properties or member methods)
 * Note: the new() method is renamed to constructor()
 *
 * @param comment The comment that appeared above this class in bs/brs
 * @param klass the actual class statement
 * @param moduleName [moduleName=""] the module name this class is in
 * @param namespaceName [namespaceName=""] the namespace this class is in
 * @returns {string} the jsdoc string for the class provided
 */
function processClass(comment: bs.CommentStatement | undefined, klass: bs.ClassStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];

    let commentLines = convertCommentTextToJsDocLines(comment);
    const klassComments = getComments(klass.body);

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
        const fieldComment = getCommentForStatement(klassComments, field);
        commentLines.push(processClassField(fieldComment, field));
    });

    commentLines.push(' */');
    output.push(...commentLines);

    const klassName = klass.name.text;
    if (parentName) {
        output.push(`class ${klassName} extends ${parentName} {\n`);
    } else {
        output.push(`class ${klassName} {\n`);
    }

    klass.methods.forEach(method => {
        const methodComment = getCommentForStatement(klassComments, method);
        output.push(processFunction(methodComment, method));
    });

    output.push('}\n');
    if (namespaceName) {
        output.push(`${namespaceName}.${klassName} = ${klassName}; `);
    }
    return output.join('\n');
}

/**
 * Processes a namespace
 * Namespaces are recursive - they can contain other functions, classes or namespaces
 *
 * @param comment The comment that appeared above this namespace in bs/brs
 * @param namespace the actual namespace statement
 * @param moduleName [moduleName=""] the module name this namespace is in
 * @param parentNamespaceName [parentNamespaceName=""] the namespace this namespace is in
 * @returns the jsdoc string for the namespace provided
 */
function processNamespace(comment: bs.CommentStatement | undefined, namespace: bs.NamespaceStatement, moduleName = '', parentNamespaceName = '') {

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
            let commentLines = convertCommentTextToJsDocLines(comment);
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

function processEnum(comment: bs.CommentStatement | undefined, enumStatement: bs.EnumStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];
    let commentLines = convertCommentTextToJsDocLines(comment);
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
    for (const enumMember of enumStatement.body) {
        if (bs.isCommentStatement(enumMember)) {
            output.push(...convertCommentTextToJsDocLines(enumMember), ' */');
            continue;
        }
        output.push(`${enumMember.name}: ${enumMember.getValue()},`);
    }
    output.push('};');

    return output.join('\n');
}

function processConst(comment: bs.CommentStatement | undefined, constStatement: bs.ConstStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];
    let commentLines = convertCommentTextToJsDocLines(comment);
    const memberOfLine = getMemberOf(moduleName, namespaceName);
    if (memberOfLine) {
        commentLines.push(memberOfLine);
    }
    commentLines.push(' * @readonly');
    commentLines.push(' * @constant');
    commentLines.push(' * @default');
    commentLines.push(' */');
    output.push(...commentLines);
    let valueOutput = {};
    if (bs.isLiteralExpression(constStatement.value)) {
        valueOutput = constStatement.value.token.text;
    }
    output.push(`var ${constStatement.name} = ${valueOutput};`);

    if (namespaceName) {
        output.push(`${namespaceName}.${constStatement.name} = ${constStatement.name};`);
    }

    return output.join('\n');
}

function processInterface(comment: bs.CommentStatement | undefined, iface: bs.InterfaceStatement, moduleName = '', namespaceName = '') {
    const output: string[] = [];

    let commentLines = convertCommentTextToJsDocLines(comment);
    const comments = getComments(iface.body);
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
            const fieldComment = getCommentForStatement(comments, field);
            commentLines.push(processInterfaceField(fieldComment, field as bs.InterfaceFieldStatement));
        }
    }
    commentLines.push(' */');
    output.push(...commentLines);
    output.push(`function ${ifaceName}() { }; \n`);

    for (const method of iface.methods) {
        if (bs.isInterfaceMethodStatement(method)) {
            const methodComment = getCommentForStatement(comments, method);
            output.push(processFunction(methodComment, method, '', ''));
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
 * @param [moduleName=""] the module name these statements are in
 * @param  namespaceName [namespaceName=""] the namespace these statements are in
 * @returns the jsdoc string for the statements provided
 */
function processStatements(statements: bs.Statement[], moduleName = '', namespaceName = '') {

    const output: string[] = [];
    const comments = getComments(statements);

    for (const statement of statements) {
        if (bs.isFunctionStatement(statement)) {
            const comment = getCommentForStatement(comments, statement);
            const functionOutput = processFunction(comment, statement, moduleName, namespaceName);
            output.push(functionOutput);
        } else if (bs.isClassStatement(statement)) {
            const comment = getCommentForStatement(comments, statement);
            const classOutput = processClass(comment, statement, moduleName, namespaceName);
            output.push(classOutput);
        } else if (bs.isNamespaceStatement(statement)) {
            const comment = getCommentForStatement(comments, statement);
            const namespaceOutput = processNamespace(comment, statement, moduleName, namespaceName);
            output.push(namespaceOutput);
        } else if (bs.isEnumStatement(statement)) {
            const comment = getCommentForStatement(comments, statement);
            const enumOutput = processEnum(comment, statement, moduleName, namespaceName);
            output.push(enumOutput);
        } else if (bs.isConstStatement(statement)) {
            const comment = getCommentForStatement(comments, statement);
            const enumOutput = processConst(comment, statement, moduleName, namespaceName);
            output.push(enumOutput);
        } else if (bs.isInterfaceStatement(statement)) {
            const comment = getCommentForStatement(comments, statement);
            const ifaceOutput = processInterface(comment, statement, moduleName, namespaceName);
            output.push(ifaceOutput);
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
