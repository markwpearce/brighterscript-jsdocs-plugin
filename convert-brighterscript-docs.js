'use strict';
const bs = require('brighterscript');
const path = require('path');

const jsCommentStartRegex = /^[\s]*(?:\/\*+)?[\s]*(.*)/g
const bsMeaningfulCommentRegex = /^[\s]*(?:'|REM)[\s]*\**[\s]*(.*)/g
const paramRegex = /@param\s+(?:{([^}]*)})?\s+(?:\[(\w+).*\]|(\w+))[\s-\s|\s]*(.*)/
const returnRegex = /@returns?\s*({(?:[^}]*)})?\s*(.*)/
const extendsRegex = /@extends/

/** @type {string[]} */
const namespacesCreated = []

/** @type {string[]} */
let parserLines = []

/**
 * Groups Statements into comments, functions, classes and namespaces
 *
 * @param {bs.Statement[]} statements
 * @returns {{functions:bs.FunctionStatement[],classes:bs.ClassStatement[],namespaces:bs.NamespaceStatement[],comments:bs.CommentStatement[]}}
 */
function groupStatements(statements) {
  /** @type{bs.CommentStatement[]} */
  const comments = []
  /** @type{bs.FunctionStatement[]} */
  const functions = []
  /** @type{bs.ClassStatement[]} */
  const classes = []
  /** @type{bs.NamespaceStatement[]} */
  const namespaces = []

  statements.forEach(statement => {
    if (statement instanceof bs.CommentStatement) {
      comments.push(statement)
    }
    if (statement instanceof bs.FunctionStatement) {
      functions.push(statement);
    }
    if (statement instanceof bs.ClassStatement) {
      classes.push(statement);
    }
    if (statement instanceof bs.NamespaceStatement) {
      namespaces.push(statement);
    }
  });
  return { comments, functions, classes, namespaces }
}


/**
 * Gets the type name for the given type
 * Defaults to "dynamic" if it can't decide
 *
 * @param {bs.BscType} type the type
 * @returns {string} the name for the type id given
 */
function getTypeName(type) {
  if (!type) {
    return "dynamic"
  }
  if (bs.isCustomType(type)) {
    return type.name;
  }
  if (type.toTypeString) {
    return type.toTypeString()
  }
  return "dynamic"
}


/**
 * Helper to clean up param or return description strings
 *
 * @param {string} [desc=""]
 * @return {string} cleaned up string
 */
function paramOrReturnDescriptionHelper(desc = "") {
  desc = (desc || "").trim()
  if (desc.startsWith("-")) {
    return desc;
  }
  if (desc.startsWith(",")) {
    desc = desc.substring(1);
  }
  if (desc) {
    return "- " + desc;
  }
  return ""
}

/**
 * Finds the comment that ends the line above the given statement
 * If the statement has annotations, the comment should be BEFORE the annotations
 *
 * @param {bs.CommentStatement[]} comments List of comments to search
 * @param {bs.Statement} stmt The statement in question
 * @returns {bs.CommentStatement} the correct comment, if found, otherwise undefined
 */
function getCommentForStatement(comments, stmt) {
  return comments.find((comment) => {
    const commentEndLine = comment.range.end.line;
    let targetStartLine = stmt.range.start.line
    if (stmt.annotations && stmt.annotations.length > 0) {
      targetStartLine = stmt.annotations[0].range.start.line;
    }
    return commentEndLine + 1 === targetStartLine || commentEndLine === stmt.range.start.line
  })
}

function getMemberOf(moduleName = "", namespaceName = "") {
  const memberOf = namespaceName || moduleName;

  if (memberOf) {
    return (` * @memberof module:${memberOf}`);
  }
  return ""
}

/**
 * Convert a comment statement text to Js Doc Lines
 * This will return a string[] with each line of a block comment
 * But - it does not include comment closing tag (ie. asterisk-slash)
 *
 * @param {bs.CommentStatement} comment
 * @returns {string[]} Array of comment lines in JSDoc format -
 */
function convertCommentTextToJsDocLines(comment) {
  const commentLines = ['/**'];
  if (comment && comment.text) {
    // Replace brighterscript comment format with jsdoc - eg.
    //   '  Comment here
    // to
    //  * Comment here
    commentLines.push(...comment.text.split('\n').map((line, i) => {
      return line.replace(bsMeaningfulCommentRegex, '$1');
    }).map(line => line.trim()).map((line, i, lines) => {
      if (i === 0) {
        line = line.replace(jsCommentStartRegex, '$1');
      }
      line = line.replace(/\**\/\s*/g, "")
      return " * " + line;
    }))
  }
  return commentLines
}
/**
 * Helper function to display a statement for debugging
 * (Not used)
 *
 * @param {bs.Statement} stmt
 * @returns {void}
 */
function displayStatement(stmt) {
  if (stmt instanceof bs.CommentStatement) {
    console.log(`Comment`)
  }
  else if (stmt instanceof bs.FunctionStatement) {
    console.log(`Function`)
  }
  else if (stmt instanceof bs.ClassStatement) {
    console.log(`Class`)
  }
  else if (stmt instanceof bs.NamespaceStatement) {
    console.log(`Namespace`)
  }
  else if (stmt instanceof bs.ClassMethodStatement) {
    console.log(`Method`)
  }
  else if (stmt instanceof bs.ClassFieldStatement) {
    console.log(`Field`)
  }
  else if (stmt.constructor) {
    console.log(`${stmt.constructor.toString()}`)
  }
  if (stmt.text) {
    console.log(stmt.text)
  }
  console.log(`Range:`, stmt.range)
}

/**
 * Processes a function or a class method
 * For class methods, the "new()" function is outputed as "constructor()"
 *
 * @param {bs.CommentStatement} comment The comment appearing above this function in bs/brs code
 * @param {bs.ClassMethodStatement} func teh actual function or class method
 * @param {string} moduleName [moduleName=""] the module name this function is in
 * @param {string} namespaceName [namespaceName=""] the namespace this function is in
 * @return {string} the jsdoc string for the function provided
 */
function processFunction(comment, func, moduleName = "", namespaceName = "") {
  const output = []
  let commentLines = convertCommentTextToJsDocLines(comment);
  const paramNameList = []

  // Find the param line in the comments that match each param
  for (const param of func.func.parameters) {
    let paramName = param.name.text;
    paramNameList.push(paramName)
    let paramType = getTypeName(param.type);
    let paramDescription = "";

    // remove @param lines for the current param
    commentLines = commentLines.filter(commentLine => {
      let commentMatch = commentLine.match(paramRegex);
      if (commentMatch) {

        const commentParamName = (commentMatch[2] || commentMatch[3]) || ""
        const commentParamType = commentMatch[1] || ""

        if (paramName.trim().toLowerCase() === commentParamName.trim().toLowerCase()) {
          // same parameter name - use these details
          if (commentParamType) {
            paramType = commentParamType.trim();
            paramDescription = commentMatch[4] || paramDescription
          }
          return false
        }
      }
      return true
    })

    let paramLine = ` * @param {${paramType}} `
    if (param.defaultValue) {
      let start = param.defaultValue.range.start;
      let end = param.defaultValue.range.end;
      let defaultValue = parserLines[start.line].slice(start.character, end.character);
      paramLine += `[${paramName}=${defaultValue}]`
    }
    else {

      paramLine += paramName
    }

    if (paramDescription) {
      paramLine += ` ${paramOrReturnDescriptionHelper(paramDescription)}`;
    }
    output.push(paramLine);
  }

  if (func.name.text[0] === '_' || func.accessModifier?.kind === "Private") {
    output.push(' * @access private');
  }

  let returnLine = ` * @return {${getTypeName(func.func.returnType)}}`
  // Find the return line in the comments
  for (var i = 0; i < commentLines.length; i++) {
    let commentMatch = commentLines[i].match(returnRegex);
    if (commentMatch) {
      let commentReturnType = getTypeName(func.func.returnType)
      if (commentMatch[1] && commentMatch[1].trim().toLowerCase() == commentReturnType.toLowerCase()) {
        // there is a return type given, and it matches the type of the function
        commentReturnType = commentMatch[1].trim()
      }
      returnLine = ` * @return {${commentReturnType}}`;
      if (commentMatch[2]) {
        returnLine += " " + paramOrReturnDescriptionHelper(commentMatch[2])
      }
      // remove the original comment @return line
      commentLines.splice(i, 1);
    }
  }


  const totalOutput = [...commentLines, ...output]
  totalOutput.push(returnLine);
  totalOutput.push(getMemberOf(moduleName, namespaceName));

  if (func.overrides) {
    totalOutput.push(` * @override`);
  }

  const funcName = func.name.text
  let funcDeclaration = `function ${funcName} (${paramNameList.join(", ")}) { }; \n`
  if (func instanceof bs.ClassMethodStatement) {
    if (funcName.toLowerCase() === "new") {
      totalOutput.push(" * @constructor")
      funcDeclaration = `constructor(${paramNameList.join(", ")}) { }; \n`
    }
    else {
      funcDeclaration = `${funcName} (${paramNameList.join(", ")}) { }; \n`
    }
  }
  totalOutput.push(' */');

  totalOutput.push(funcDeclaration);
  if (namespaceName) {
    totalOutput.push(`${namespaceName}.${funcName} = ${funcName}; `)
  }

  return totalOutput.join('\n')
}

/**
 * Processed a Class Field
 * These are added as property tags in the class's jsdoc comment
 * Private fields are ignored
 *
 * @param {bs.CommentStatement} comment the comment in the line above this field
 * @param {bs.ClassFieldStatement} field the field to process
 * @return {string} the property tag for the class this field is in
 */
function processClassField(comment, field) {
  if (field.accessModifier?.kind === "Private") {
    return ""
  }
  let description = "";
  if (comment) {
    description = comment.text.replace(bsMeaningfulCommentRegex, '$1');
  }
  return ` * @property { ${getTypeName(field.getType())} } ${field.name.text} ${description} `;
}


/**
 * Processes a class
 * Classes can have member fields (properties or member methods)
 * Note: the new() method is renamed to constructor()
 *
 * @param {bs.CommentStatement} comment The comment that appeared above this class in bs/brs
 * @param {bs.ClassStatement} klass the actual class statement
 * @param {string} moduleName [moduleName=""] the module name this class is in
 * @param {string} namespaceName [namespaceName=""] the namespace this class is in
 * @return {string} the jsdoc string for the class provided
 */
function processClass(comment, klass, moduleName = "", namespaceName = "") {
  const output = []

  let commentLines = convertCommentTextToJsDocLines(comment);
  const klassCode = groupStatements(klass.body)

  let parentClassName = "", extendsLine = ""
  if (klass.parentClassName) {
    parentClassName = klass.parentClassName.getName()
    extendsLine = ` * @extends ${klass.parentClassName.getName()} `
  }

  for (var i = 0; i < commentLines.length; i++) {
    let commentMatch = commentLines[i].match(extendsRegex);
    if (commentMatch && commentMatch[1]) {
      commentLines.splice(i, 1);
      break;
    }
  }
  if (extendsLine) {
    commentLines.push(extendsLine);
  }
  // get properties
  commentLines.push(getMemberOf(moduleName, namespaceName));
  klass.fields.forEach(field => {
    const fieldComment = getCommentForStatement(klassCode.comments, field)
    commentLines.push(processClassField(fieldComment, field))
  });

  commentLines.push(' */');
  output.push(commentLines.join('\n'));

  const klassName = klass.name.text
  if (parentClassName) {
    output.push(`class ${klassName} extends ${parentClassName} {\n`);
  }
  else {
    output.push(`class ${klassName} {\n`);
  }

  klass.methods.forEach(method => {
    const methodComment = getCommentForStatement(klassCode.comments, method)
    output.push(processFunction(methodComment, method))
  })

  output.push('}\n')
  if (namespaceName) {
    output.push(`${namespaceName}.${klassName} = ${klassName}; `)
  }
  return output.join('\n')
}

/**
 * Processes a namespace
 * Namespaces are recursive - they can contain other functions, classes or namespaces
 *
 * @param {bs.CommentStatement} comment The comment that appeared above this namespace in bs/brs
 * @param {bs.NamespaceStatement} namespace the actual namespace statement
 * @param {string} moduleName [moduleName=""] the module name this namespace is in
 * @param {string} parentNamespaceName [parentNamespaceName=""] the namespace this namespace is in
 * @return {string} the jsdoc string for the namespace provided
 */
function processNamespace(comment, namespace, moduleName = "", parentNamespaceName) {

  const output = [];
  let namespaceName = namespace.name;

  if (parentNamespaceName) {
    namespaceName = parentNamespaceName + "." + namespaceName
  }
  if (!namespacesCreated.includes(namespaceName)) {
    // have not created this namespace yet
    let commentLines = convertCommentTextToJsDocLines(comment);

    //  if (namespaceName !== moduleName) {
    commentLines.push(getMemberOf(moduleName, parentNamespaceName));
    // }
    commentLines.push(` * @namespace ${namespaceName} `)
    commentLines.push(' */');

    output.push(commentLines.join('\n'));
    if (parentNamespaceName) {
      output.push(`${parentNamespaceName}.namespaceName = {}`)
    }
    else {
      output.push(`var ${namespaceName} = {}; `);
    }
    namespacesCreated.push(namespaceName)
  }

  output.push(processStatements(namespace.body.statements, moduleName, namespaceName))
  return output.join('\n');
}



/**
 * Process bright(er)script statements. Handles functions, namespace or class statements
 * Namespaces are recursive - they can contain other functions, classes or namespaces
 *
 * @param {bs.Statement[]} statements an array of statements
 * @param {string} [moduleName=""] the module name these statements are in
 * @param {string} namespaceName [namespaceName=""] the namespace these statements are in
 * @returns {string} the jsdoc string for the statements provided
 */
function processStatements(statements, moduleName = "", namespaceName = "") {

  const output = [];
  const code = groupStatements(statements)

  if (code.comments.length === 0 && code.functions.length === 0 && code.classes.length === 0 && code.namespaces.length === 0) {
    return '';
  }

  code.functions.forEach(func => {
    const comment = getCommentForStatement(code.comments, func)
    const functionOutput = processFunction(comment, func, moduleName, namespaceName)
    output.push(functionOutput);
  });
  code.classes.forEach(klass => {
    const comment = getCommentForStatement(code.comments, klass)
    const classOutput = processClass(comment, klass, moduleName, namespaceName)
    output.push(classOutput);
  });

  code.namespaces.forEach(namespace => {
    const comment = getCommentForStatement(code.comments, namespace)
    const namespaceOutput = processNamespace(comment, namespace, moduleName, namespaceName)
    output.push(namespaceOutput);
  });
  return output.join('\n');
}


exports.handlers = {
  beforeParse(e) {
    parserLines = e.source.split('\n');
    const parserOptions = {};
    const fileExt = path.extname(e.filename);
    if (fileExt.toLowerCase() === ".bs") {
      parserOptions.mode = bs.ParseMode.BrighterScript;
    }
    const lexResult = bs.Lexer.scan(e.source);
    const parser = new bs.Parser();
    const parseResult = parser.parse(lexResult.tokens, parserOptions);
    const statements = parseResult.statements

    // Add our module to the top of the file if it doesn't exist. If it does find out the name
    const moduleMatch = e.source.match(/@module ([^\*\s]+)/);
    let moduleName = "";
    const output = [];
    if (moduleMatch) {
      moduleName = moduleMatch[1];
    } else {
      moduleName = path.parse(e.filename).name.replace(/\./g, '_');
    }
    output.push(`/** @module ${moduleName} */`);

    output.push(processStatements(statements, moduleName))

    e.source = output.join('\n');
    //console.log(e.source)
  }
};
