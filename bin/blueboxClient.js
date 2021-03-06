#!/usr/bin/env node
/*
Copyright Jesus Perez <jesusprubio gmail com>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

var async       = require('async'),
    readline    = require('readline'),
    shell       = require('shelljs'),
    lodash      = require('lodash'),
    fs          = require('fs'),

    Bluebox     = require('../'),
    printer     = require('../utils/printer'),

    // Globals
    shodanKey     = null,
    virustotalKey = null,
    modulesInfo   = {},
    modulesList   = [],
    exitNext      = false,
    bluebox;


function completer (line) {
    var completions = modulesList.join(' '),
        hits;

    hits = modulesList.filter(function (c) {
        return c.indexOf(line) === 0;
    });

    return [(hits.length + 1 ? hits : completions), line];
}

function runModule (moduleName, rl) {
    var moduleInfo    = modulesInfo[moduleName].info,
        bModule       = require('../modules/' + moduleName),
        moduleOptions = {},
        chosenTransport;

    function cb (err, result) {
        printer.bold('\nRESULT:\n');
        if (!err) {
            if (!result || result.length === 0) {
                printer.highlight('No result');
            } else {
                printer.json(result);
            }
        } else {
            printer.error('ERROR: run(): ' + JSON.stringify(err));
        }
        printer.regular('\n');
        rl.prompt();
    }

    printer.bold('\n' + moduleInfo.name + ': ' + moduleInfo.description + '\n');
    // Asking for the parameters (if any)
    if (moduleInfo.options) {
        async.eachSeries(
            Object.keys(moduleInfo.options),
            function (option, callback) {
                var defaultValue = moduleInfo.options[option].defaultValue,
                    printDefault = 'required';

                if (defaultValue ||  defaultValue === 0) {
                    printDefault = defaultValue;
                }
                // Avoiding to ask for not needed params
                if ((option === 'tlsType' && chosenTransport !== 'tls') ||
                    (option === 'wsPath' && chosenTransport !== 'ws')) {
                    callback();
                } else {
                    rl.question(
                        '* ' + option +
                        ': ' + moduleInfo.options[option].description +
                        ' (' + printDefault + '): ',
                        function (answer) {
                            answer = answer.trim();
                            if (option === 'transport') {
                                if (!answer) {
                                    chosenTransport = 'udp';
                                } else {
                                    chosenTransport = answer.toLowerCase();
                                }
                            }
                            if (answer) {
                                moduleOptions[option] = answer;
                            }
                            callback();
                        }
                    );
                }
            },
            function (err) {
                printer.infoHigh('\nStarting ...\n');
                bluebox.runModule(moduleName, moduleOptions, cb);
            }
        );
    } else {
        printer.infoHigh('\nStarting ...\n');
        bluebox.runModule(moduleName, moduleOptions, cb);
    }
}

function exitBluebox () {
    printer.bold('\nSee you! ;)');
    process.exit();
}

function runCommand (comm, rl) {
    var splitComm = comm.split(' '),
        commCases = {
            // Just in case a enter push
            ''     : function () {
                rl.prompt();
            },
            'quit' : function () {
                exitBluebox();
            },
            'exit' : function () {
                exitBluebox();
            },
            'help' : function () {
                if (splitComm.length > 1) {
                    if (modulesList.indexOf(splitComm[1]) !== -1) {
                        if (splitComm[1] === 'help') {
                            printer.error('Really? xD');
                        } else {
                            printer.json(modulesInfo[splitComm[1]].info);
                        }
                    } else {
                        printer.error('ERROR: Module not found');
                    }
                } else {
                    lodash.each(modulesInfo, function (moduleInfo) {
                        printer.highlight(moduleInfo.info.name);
                        printer.regular(moduleInfo.info.description);
                    });

                    printer.infoHigh('\n' + 'You can get more info about a module ' +
                                      'using "help MODULE" (ie: "help sipScan")');
                }
                rl.prompt();
            },
            'setShodanKey' : function () {
                rl.question(
                    '* Enter your key: ',
                    function (answer) {
                        if (answer) {
                            answer = answer.trim();
                            bluebox.setShodanKey(answer);
                            printer.infoHigh('Using SHODAN key: ');
                            printer.highlight(answer + '\n');
                        }
                        rl.prompt();
                    }
                );
            }
//            'setVirustotalKey' : function () {
//                rl.question(
//                    '* Enter your key: ',
//                    function (answer) {
//                        if (answer) {
//                            answer = answer.trim();
//                            bluebox.setVirustotalKey(answer);
//                            printer.infoHigh('Using Virus Total key: ');
//                            printer.highlight(answer + '\n');
//                        }
//                        rl.prompt();
//                    }
//                );
//            }
        };

    if (commCases[splitComm[0]]) {
        commCases[splitComm[0]]();
    } else {
        if (modulesList.indexOf(comm) !== -1) {
            runModule(comm, rl);
        } else {
            shell.exec(comm, { silent : true }, function (code, output) {
                if (code === 127) {
                    printer.error('ERROR: module/command not found');
                } else {
                    printer.regular(output);
                }
                rl.prompt();
            });
        }
    }
}

function createPrompt () {
    var rl = readline.createInterface(process.stdin, process.stdout, completer);

    rl.setPrompt('Bluebox-ng> ');
    rl.prompt();

    // On new line
    rl.on('line', function (line) {
        runCommand(line.trim(), rl);
    });

    // On Ctrl+C, Ctrl+D, etc.
    rl.on('close', function () {
        if (!exitNext) {
            printer.bold('\nPress Ctrl+C again to quit.');
            exitNext = true;
            createPrompt();
            // If more than 5 secs. the user will need
            // to push the keys combination twice again
            setTimeout(
                function () {
                    exitNext = false;
                },
                5000
            );
        } else {
            exitBluebox();
        }
    });
}


// Creating the Bluebox object
bluebox = new Bluebox();

modulesInfo = bluebox.getModulesInfo();
// Generating modules list
lodash.each(bluebox.getModulesInfo(), function (v, k) {
    modulesList.push(k);
});
// and manually adding client modules
modulesList = modulesList.concat(['help', 'quit', 'exit', 'setShodanKey']);

// Welcome info is printed
printer.bold('\n\tWelcome to Bluebox-ng\n');
printer.info('Type "help" to see available commands');
printer.info('If you have doubts just use the default options :)\n');

// The prompt is started
createPrompt();

// Just in case ;)
process.on('uncaughtException', function (err) {
    printer.error('"uncaughtException" found:');
    printer.error(err);
});
