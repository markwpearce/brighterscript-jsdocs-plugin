import * as cbd from './convert-brighterscript-docs';
import { expect } from 'chai';
import { expectOutput } from './testHelpers.spec';

describe('convertBrighterscriptDocs', () => {
    beforeEach(() => {
        cbd.resetCreatedCache();
        global['env'] = {};
    });

    it('should export a jsdocs plugin', () => {
        expect(cbd).haveOwnProperty('handlers');
        expect(cbd.handlers.beforeParse).to.be.a('function');
        const event = {
            filename: 'main.bs', source: `
                function main()
                    print("Hello, World!")
                end function
      ` };
        cbd.handlers.beforeParse(event);
        expect(event.source).to.be.a('string');
    });

    it('adds jsdoc to plain code', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            function main()
                print("Hello, World!")
            end function
      `), `
            /**
             * @function
             * @returns {dynamic}
             */
            function main () { };
      `);
    });

    it('converts bsdoc with comments to jsdoc', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' This is a comment
            ' This is another comment
            function main()
                print("Hello, World!")
            end function
      `), `
            /**
             * This is a comment
             * This is another comment
             * @function
             * @returns {dynamic}
             */
            function main () { };
      `);
    });

    it('converts bsdoc with params/returns to jsdoc', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' Say hello
            ' @param name you want to say hello to
            ' @returns the greeting
            function sayHello(name as string) as string
                return "Hello, " + name + "!")
            end function
      `), `
            /**
             * Say hello
             * @function
             * @param {string} name you want to say hello to
             * @returns {string} the greeting
             */
            function sayHello (name) { };
      `);
    });

    it('keeps multi-line param and return descriptions with their tags', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' Say hello
            ' @param {string} name you want to say hello to
            '   which can be long
            ' @param count
            '   how many times to say it
            ' @returns the greeting
            '   repeated count times
            '
            ' More description after a blank line
            function sayHello(name as string, count as integer) as string
                return "Hello, " + name + "!")
            end function
      `), `
            /**
             * Say hello
             *
             * More description after a blank line
             * @function
             * @param {string} name you want to say hello to
             * which can be long
             * @param {integer} count how many times to say it
             * @returns {string} the greeting
             * repeated count times
             */
            function sayHello (name, count) { };
      `);
    });

    it('uses comment type over given type', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' Say hello
            ' @param {roAssociativeArray} person aa with name property
            ' @returns the greeting
            function sayHello(person as object) as string
                return "Hello, " + person.name + "!")
            end function
      `), `
            /**
             * Say hello
             * @function
             * @param {roAssociativeArray} person aa with name property
             * @returns {string} the greeting
             */
            function sayHello (person) { };
      `);
    });

    it('uses custom type name', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' Say hello
            ' @param johnDoe A Person to say hello to
            ' @returns the greeting
            function sayHello(johnDoe as Person) as string
                return "Hello, " + john.name + "!")
            end function
      `), `
            /**
             * Say hello
             * @function
             * @param {Person} johnDoe A Person to say hello to
             * @returns {string} the greeting
             */
            function sayHello (johnDoe) { };
      `);
    });

    it('uses custom type name for return type', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' Say hello
            ' @param johnDoe A Person to say hello to
            ' @returns the greeting
            function sayHello(johnDoe as Person) as OtherThing
                return new OtherThing(john.name)
            end function
      `), `
            /**
             * Say hello
             * @function
             * @param {Person} johnDoe A Person to say hello to
             * @returns {OtherThing} the greeting
             */
            function sayHello (johnDoe) { };
      `);
    });

    it('allows @ tags to go throygh', () => {
        expectOutput(cbd.convertBrighterscriptDocs(`
            ' test tags
            ' @sometag details
            function whatever() as integer
                return 123
            end function
      `), `
            /**
             * test tags
             * @sometag details
             * @function
             * @returns {integer}
             */
            function whatever () { };
      `);
    });

    describe('classes', () => {
        it('create class comments', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' A representation of a person
                class Person
                    ' The name of the person
                    name as string
                end class
            `), `
                /**
                 * A representation of a person
                 * @property {string} name The name of the person
                 */
                class Person {

                }
            `);
        });

        it('does not crash on fields with an object literal default value', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                class Foo
                    colliders as roAssociativeArray = {}
                    other = {}
                end class
            `), `
                /**
                 * @property {roAssociativeArray} colliders
                 * @property {object} other
                 */
                class Foo {

                }
            `);
        });

        it('creates docs for namespaced class with methods', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                namespace Company
                    ' A code monkey
                    class Programmer extends Employee
                        ' The name of the person
                        name as string
                        '
                        languages as roArray

                        'Create a new programmer
                        sub new(name as string)
                            m.name = name
                        end sub

                        ' Write some code
                        ' @param lines how many lines to write
                        ' @param language what language to write in
                        ' @returns the code
                        function writeCode(lines as integer, language as string) as string
                            return "Code written"
                        end function
                    end class
                end namespace
            `), `
                /**
                 * @global
                 * @namespace Company
                 */
                var Company = {};

                /**
                 * A code monkey
                 * @extends Employee
                 * @memberof! Company
                 * @property {string} name The name of the person
                 * @property {roArray} languages
                 */
                class Programmer extends Employee {

                /**
                 * Create a new programmer
                 * @function
                 * @param {string} name
                 * @constructor
                 * @returns {Company.Programmer}
                 */
                constructor(name) { };

                /**
                 * Write some code
                 * @function
                 * @param {integer} lines how many lines to write
                 * @param {string} language what language to write in
                 * @returns {string} the code
                 */
                writeCode (lines, language) { };

                }

                Company.Programmer = Programmer;
            `);
        });

        it('outputs jsdoc for a deeper class', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' @module BGE
                namespace BGE.Debug.Alpha.Beta

                class DebugWindow extends BGE.UI.UiContainer

                    function new(game as BGE.Game) as void
                        super(game)
                        m.backgroundRGBA = BGE.RGBAtoRGBA(128, 128, 128, 0.5)
                        m.padding.set(10)
                    end function
                end class

                end namespace
            `), `
                /**
                 * @global
                 * @namespace BGE
                 */
                var BGE = {};

                /**
                 * @global
                 * @namespace BGE/Debug
                 * @alias BGE.Debug
                 */
                BGE.Debug = {};

                /**
                 * @global
                 * @namespace BGE/Debug/Alpha
                 * @alias BGE.Debug.Alpha
                 */
                BGE.Debug.Alpha = {};

                /**
                 * @global
                 * @namespace BGE/Debug/Alpha/Beta
                 * @alias BGE.Debug.Alpha.Beta
                 */
                BGE.Debug.Alpha.Beta = {};

                /**
                 * @extends BGE.UI.UiContainer
                 * @memberof! BGE/Debug/Alpha/Beta
                 */
                class DebugWindow extends BGE.UI.UiContainer {

                /**
                 * @function
                 * @param {BGE.Game} game
                 * @constructor
                 * @returns {BGE.Debug.Alpha.Beta.DebugWindow}
                 */
                constructor(game) { };

                }

                BGE.Debug.Alpha.Beta.DebugWindow = DebugWindow;
            `);
        });

        it('does not repeat the parent name for nested namespaces', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                namespace BGE
                    namespace Math.Inner
                        function foo()
                        end function
                    end namespace
                end namespace
            `), `
                /**
                 * @global
                 * @namespace BGE
                 */
                var BGE = {};

                /**
                 * @global
                 * @namespace BGE/Math
                 * @alias BGE.Math
                 */
                BGE.Math = {};

                /**
                 * @global
                 * @namespace BGE/Math/Inner
                 * @alias BGE.Math.Inner
                 */
                BGE.Math.Inner = {};

                /**
                 * @function
                 * @memberof! BGE/Math/Inner
                 * @returns {dynamic}
                 */
                function foo () { };

                BGE.Math.Inner.foo = foo;
            `);
        });
    });

    describe('enums', () => {

        it('creates jsdoc for enums', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' Some colors
                enum Colors
                    Red = 0
                    Green = 1
                    Blue = 2
                end enum
            `), `
                /**
                 * Some colors
                 * @readonly
                 * @enum
                 */
                var Colors = {
                Red: 0,
                Green: 1,
                Blue: 2,
                };
            `);
        });

        it('creates jsdoc for enums in namespaces', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                namespace alpha
                    ' Some colors
                    enum Colors
                        Red = 0
                        Green = 1
                        Blue = 2
                    end enum
                end namespace
            `), `
                /**
                 * @global
                 * @namespace alpha
                 */
                var alpha = {};

                /**
                 * Some colors
                 * @memberof! alpha
                 * @readonly
                 * @enum
                 */
                alpha.Colors = {
                Red: 0,
                Green: 1,
                Blue: 2,
                };
            `);
        });

        it('creates jsdoc for enums with member comments', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' Some colors
                enum Colors
                    ' ruby
                    Red = 0
                    ' emerald
                    Green = 1
                    ' sapphire
                    Blue = 2
                end enum
            `), `
                /**
                 * Some colors
                 * @readonly
                 * @enum
                 */
                var Colors = {
                /**
                 * ruby
                 */
                Red: 0,
                /**
                 * emerald
                 */
                Green: 1,
                /**
                 * sapphire
                 */
                Blue: 2,
                };
            `);
        });

        it('normalizes hex literals for enum member values', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                enum Colors
                    Black = &h000000FF
                    White = &hFFFFFFFF
                end enum
            `), `
                /**
                 * @readonly
                 * @enum
                 */
                var Colors = {
                Black: 0x000000FF,
                White: 0xFFFFFFFF,
                };
            `);
        });
    });

    describe('interfaces', () => {
        it('creates jsdoc for interfaces', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' an interface for a person
                interface Person
                    name as string
                end interface
            `), `
                /**
                 * an interface for a person
                 * @interface
                 * @property {string} name
                 */
                function Person() { };
            `);
        });

        it('creates jsdoc for interface with function', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' an interface for a person
                interface Person
                    name as string

                    ' how high should they jump
                    function jump(howHigh as float) as string
                end interface
            `), `
                /**
                 * an interface for a person
                 * @interface
                 * @property {string} name
                 */
                function Person() { };

                /**
                 * how high should they jump
                 * @function
                 * @param {float} howHigh
                 * @returns {string}
                 */
                Person.prototype.jump = function(howHigh) { };
            `);
        });

        it('creates jsdoc for interface in a namespace', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                namespace alpha
                    ' an interface for a person
                    interface Person
                        name as string

                        ' how high should they jump
                        function jump(howHigh as float) as string
                    end interface
                end namespace
            `), `
                /**
                 * @global
                 * @namespace alpha
                 */
                var alpha = {};

                /**
                 * an interface for a person
                 * @interface
                 * @memberof! alpha
                 * @property {string} name
                 */
                function Person() { };

                /**
                 * how high should they jump
                 * @function
                 * @param {float} howHigh
                 * @returns {string}
                 */
                Person.prototype.jump = function(howHigh) { };

                alpha.Person = Person;
            `);
        });
    });

    describe('constants', () => {
        it('creates jsdoc for constants', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                    ' Test comment
                    const MY_CONSTANT = "hello"
                `), `
                    /**
                     * Test comment
                     * @readonly
                     * @constant
                     * @default
                     */
                    var MY_CONSTANT = "hello";
            `);
        });

        it('creates jsdoc for constants in namespaces', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                    namespace alpha
                        ' Test comment
                        const MY_CONSTANT = "hello"
                    end namespace
                `), `

                    /**
                     * @global
                     * @namespace alpha
                     */
                    var alpha = {};

                    /**
                     * Test comment
                     * @memberof! alpha
                     * @readonly
                     * @constant
                     * @default
                     */
                    var MY_CONSTANT = "hello";
                    alpha.MY_CONSTANT = MY_CONSTANT;
            `);
        });

        it('normalizes hex literals for constant values', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                    const MY_CONSTANT = &hFF0000FF
                `), `
                    /**
                     * @readonly
                     * @constant
                     * @default
                     */
                    var MY_CONSTANT = 0xFF0000FF;
            `);
        });

        it('uses the source text as the default for non-literal constant values', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                    namespace alpha
                        const MAX_STEP = 1.0 / 30.0
                        const NEG = -1
                        const REF = MAX_STEP
                    end namespace
                `), `
                    /**
                     * @global
                     * @namespace alpha
                     */
                    var alpha = {};

                    /**
                     * @memberof! alpha
                     * @readonly
                     * @constant
                     * @default 1.0 / 30.0
                     */
                    var MAX_STEP = undefined;
                    alpha.MAX_STEP = MAX_STEP;
                    /**
                     * @memberof! alpha
                     * @readonly
                     * @constant
                     * @default -1
                     */
                    var NEG = undefined;
                    alpha.NEG = NEG;
                    /**
                     * @memberof! alpha
                     * @readonly
                     * @constant
                     * @default MAX_STEP
                     */
                    var REF = undefined;
                    alpha.REF = REF;
            `);
        });

        it('collapses multi-line non-literal constant values onto one line', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                    const ITEMS = [
                        1,
                        2
                    ]
                `), `
                    /**
                     * @readonly
                     * @constant
                     * @default [ 1, 2 ]
                     */
                    var ITEMS = undefined;
            `);
        });
    });

    describe('comment adjacency', () => {
        it('does not attach a blank-line-separated comment to the following function', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' Not attached - there's a blank line below

                function main()
                    print("Hello, World!")
                end function
            `), `
                /**
                 * @function
                 * @returns {dynamic}
                 */
                function main () { };
            `);
        });

        it('does not attach a previous field\'s trailing same-line comment to the following field', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                class Person
                    firstName as string ' the person's first name

                    ' the person's last name
                    lastName as string
                end class
            `), `
                /**
                 * @property {string} firstName
                 * @property {string} lastName the person's last name
                 */
                class Person {

                }
            `);
        });

        it('attaches a comment before annotations/decorators to the function, not the decorator', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' Comments should go before annotations and decorators
                '
                ' @param {string} param1 A no op value
                ' @return {string} whatever was included as param1
                @someDecorator("func")
                function funcWithDecorator(param1 as string) as string
                    return param1
                end function
            `), `
                /**
                 * Comments should go before annotations and decorators
                 *
                 * @function
                 * @param {string} param1 A no op value
                 * @returns {string} whatever was included as param1
                 */
                function funcWithDecorator (param1) { };
            `);
        });

        it('does not attach a trailing same-line comment on a previous field to a decorated method', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                class DecoratorsTestKlass
                    property as float = 3.14 ' yum, pi!

                    ' Member function comments come before decorators
                    @someDecorator("method")
                    function someFunc(num) as string
                        return \`hello \${num}\`
                    end function
                end class
            `), `
                /**
                 * @property {float} property
                 */
                class DecoratorsTestKlass {

                /**
                 * Member function comments come before decorators
                 * @function
                 * @param {dynamic} num
                 * @returns {string}
                 */
                someFunc (num) { };

                }
            `);
        });
    });

    describe('BrighterScript v1 types', () => {
        it('creates a jsdoc union type for a union type param and return', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' Make a price string
                ' @param value the value
                function makePriceString(value as string or integer) as string or boolean
                    return "$" + value.ToStr()
                end function
            `), `
                /**
                 * Make a price string
                 * @function
                 * @param {(string|integer)} value the value
                 * @returns {(string|boolean)}
                 */
                function makePriceString (value) { };
            `);
        });

        it('falls back to dynamic for an intersection type param, since JSDoc has no intersection syntax', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                interface HasId
                    id as string
                end interface

                interface HasUrl
                    url as string
                end interface

                ' Get the URL with the given id appended as a query param
                function getUrlWithQueryId(value as HasId and HasUrl) as string
                    return value.url
                end function
            `), `
                /**
                 * @interface
                 * @property {string} id
                 */
                function HasId() { };

                /**
                 * @interface
                 * @property {string} url
                 */
                function HasUrl() { };

                /**
                 * Get the URL with the given id appended as a query param
                 * @function
                 * @param {dynamic} value
                 * @returns {string}
                 */
                function getUrlWithQueryId (value) { };
            `);
        });

        it('creates a jsdoc array type for a typed array param and return', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' Sum some numbers
                ' @param values the numbers to sum
                function sum(values as integer[]) as integer
                    return 0
                end function
            `), `
                /**
                 * Sum some numbers
                 * @function
                 * @param {Array.<integer>} values the numbers to sum
                 * @returns {integer}
                 */
                function sum (values) { };
            `);
        });

        it('creates a jsdoc array type using the custom type name for a typed array of a class', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                class Person
                end class

                ' Gets everyone
                function getPeople() as Person[]
                    return []
                end function
            `), `
                /**
                 */
                class Person {

                }

                /**
                 * Gets everyone
                 * @function
                 * @returns {Array.<Person>}
                 */
                function getPeople () { };
            `);
        });

        it('creates a jsdoc union type for a class field with a union type', () => {
            expectOutput(cbd.convertBrighterscriptDocs(`
                ' A person
                class Person
                    ' the id
                    id as string or integer
                end class
            `), `
                /**
                 * A person
                 * @property {(string|integer)} id the id
                 */
                class Person {

                }
            `);
        });
    });
});