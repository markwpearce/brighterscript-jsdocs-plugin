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
    });
});