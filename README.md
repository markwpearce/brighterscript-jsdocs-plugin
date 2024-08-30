# What is this?

Plugin For [JSDoc](https://jsdoc.app/) that converts Roku's BrightScriptDoc comments into comments compatible with JSDoc.

Especially designed to work with both [Brightscript](https://developer.roku.com/docs/references/brightscript/language/brightscript-language-reference.md) and [Brighterscript](https://github.com/rokucommunity/brighterscript).

Automatically pulls in function/sub name and param and return types. Can be overridden with more info as desired (description, param type override or param description). Automatically bases module off of file name but can be changed and used to combine multiple files into one module. Module is automatically applied to each sub/function in that file.

# How To View Example Docs

```
git clone https://github.com/markwpearce/brighterscript-jsdocs-plugin.git
cd brighterscript-jsdocs-plugin
npm install
npm run docs
```

Docs are output in docs folder.

# Installation

1. Install via NPM

```
npm install brighterscript-jsdocs-plugin --save-dev
```

I recommend using a custom template. I like https://github.com/braintree/jsdoc-template:

```
npm install braintree-jsdoc-template --save-dev
```

2. Configure

Create a `./jsdoc.json` configuration file - https://jsdoc.app/about-configuring-jsdoc.html.

Example:

```jsonc
{
    "plugins": [
        "plugins/markdown",
        "./node_modules/brighterscript-jsdocs-plugin/dist/convert-brighterscript-docs.js"
    ],
    "source": {
        "include": [
            "src" // directories with .bs/.brs files
        ],
        "includePattern": ".+\\.br?s$"
    },
    "opts": {
        "recurse": true,
        "template": "node_modules/clean-jsdoc-theme", // or whatever template you've chosen - see below
        "brighterscript-jsdocs-plugin": {
            "addModule": true, // true by default - should we generate module names based on the file names?
            "escapeHTMLCharacters": false // false by default - should we escape html characters (<>/&") in comments?
        }
    }
}
```

Note: You may want to set configuration value `opts.brighterscript-jsdocs-plugin.addModule` to `false` if you are using Brighterscript namespaces and you want your code grouped by namespace.

3. Add a script to `package.json` like:

```json
  "scripts": {
    "docs": "./node_modules/.bin/jsdoc -c jsdoc.json -d docs"
  }
```

# Options

You can add these options to the `jsdoc.json` file under `opts.brighterscript-jsdocs-plugin`

addModule
: Boolean (`true`/`false`) - Should we generate module names based on the file names? - defaults to `true`

escapeHTMLCharacters
: Boolean (`true`/`false`) - Should we escape html characters (`<>/&"'`) in comments? - defaults to `false`

# Generating Documentation

Run the script to generate documentation! (Documentation is put in the `./docs/` folder)

```
npm run docs
```

# Templates

The default JSDocs template may not meet your needs. Here's a good list of templates that are available:

https://cancerberosgx.github.io/jsdoc-templates-demo/demo/

# Brightscript and Brighterscript

Internally, this plugin uses the [Brighterscript](https://github.com/rokucommunity/brighterscript) parser. Brighterscript is a superset of Roku's Brightscript language, so plain old .brs files should be parsed properly.

# Writing Documentation

If you have used [BrightScriptDoc](https://developer.roku.com/docs/developer-program/dev-tools/brightscript-doc.md) formatting for documentation, most comments should be parsed properly

Basic tags for functions and classes should work: @param, @return, etc. As this is a plugin for jsdoc, other tags that are included in the comments are passed through to jsdoc for interpretation.

It is not necessary to wrap BrightScript comments in javascript style comments, but the plugin should handle either situation.

These comments will be parsed the same:

```
' Give the maximum of two numbers
' @param {integer} x - the first number
' @param {integer} y - the second number
' @return {integer} the max of x and y
function maxBrsStyle(x, y)
  if x > y
    return x
  end if
  return y
end function

' /**
'  * Give the maximum of two numbers
'  * @param {integer} x - the first number
'  * @param {integer} y - the second number
'  * @return {integer} the max of x and y
' */
function maxJsStyle(x, y)
  if x > y
    return x
  end if
  return y
end function
```

## Example

```
' Namespace for testing
namespace TestBsDoc

  ' Test Brighterscript class
  class TestBsKlass

    prop as float = 1

    ' I like eating pie
    someField as float = 3.14

    ' Constructor
    '@param {string} name for this Class
    function new(name as string) as void
      m.name = name
    end function

    ' Capitalizes a word
    ' @param {string} the word to capitalize
    ' @return the capitalized word
    function capitalize(word as string) as string
      return ucase(word)
    end function

    ' Says hi to the given name
    function sayHello() as string
      return "hi " + m.name
    end function
  end class

end namespace
```
