import fs from 'fs';

export default {
    /** Globs to analyze */
    globs: [],

    /** Directory to output CEM to */
    outDir: './',

    litElement: true,

    /** Plugins */
    plugins: [
        // Plugin to extract full JSDoc descriptions by parsing source manually
        {
            name: 'full-jsdoc-extractor',
            packageLinkPhase({ customElementsManifest }) {
                // For every module in the CEM
                customElementsManifest.modules?.forEach((module, moduleIndex) => {
                    // Read the source file
                    try {
                        const sourceContent = fs.readFileSync(module.path, 'utf-8');

                        // Process each declaration in the module
                        module.declarations?.forEach((declaration, declarationIndex) => {
                            // Extract the main class JSDoc comment manually - only the one directly before @customElement
                            // First find the @customElement position
                            const customElementMatch = sourceContent.match(/@customElement/);
                            let classCommentMatch = null;

                            if (customElementMatch) {
                                const customElementPos = customElementMatch.index;
                                // Look backwards from @customElement to find the last JSDoc comment
                                const beforeCustomElement = sourceContent.substring(0, customElementPos);
                                // Find all JSDoc comments, take the last one
                                const allJSDocMatches = [...beforeCustomElement.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
                                if (allJSDocMatches.length > 0) {
                                    classCommentMatch = allJSDocMatches[allJSDocMatches.length - 1];
                                }
                            }

                            if (classCommentMatch) {
                                const fullComment = classCommentMatch[1]
                                    .split('\n')
                                    .map(line => line.replace(/^\s*\*\s?/, ''))
                                    .join('\n')
                                    .trim();

                                declaration.description = fullComment;
                            }

                            // Extract property descriptions - universal approach
                            if (declaration.members) {
                                declaration.members.forEach(member => {
                                    if (member.kind === 'field' && member.name) {
                                        // Find JSDoc comment directly before this property declaration
                                        // Look for patterns like: /** comment */ @property(...) accessor propertyName
                                        const propertyRegexes = [
                                            // Pattern 1: /** ... */ @property(...) accessor propertyName
                                            new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*@property[^}]*}[^}]*}[^}]*accessor\\s+${member.name}`, 'g'),
                                            // Pattern 2: /** ... */ @property(...) \n accessor propertyName
                                            new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*@property[^}]*}[^}]*}[^}]*\\s+accessor\\s+${member.name}`, 'g'),
                                            // Pattern 3: Simpler - /** ... */ @property accessor propertyName
                                            new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*@property[^\\n]*\\s+accessor\\s+${member.name}`, 'g'),
                                            // Pattern 4: Very broad - /** ... */ anything @property anything accessor propertyName
                                            new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/[\\s\\S]*?@property[\\s\\S]*?accessor\\s+${member.name}\\b`, 'g')
                                        ];

                                        for (const regex of propertyRegexes) {
                                            const match = regex.exec(sourceContent);
                                            if (match) {
                                                const fullComment = match[1]
                                                    .split('\n')
                                                    .map(line => line.replace(/^\s*\*\s?/, ''))
                                                    .join('\n')
                                                    .trim();

                                                if (fullComment) {
                                                    member.description = fullComment;
                                                    break; // Stop at first match
                                                }
                                            }
                                            regex.lastIndex = 0; // Reset regex
                                        }
                                    }
                                });
                            }

                            // Extract method descriptions
                            const methodPattern = /\/\*\*([\s\S]*?)\*\/[\s]*(\w+)\s*\([^{]*\)\s*{/g;
                            const methodComments = [...sourceContent.matchAll(methodPattern)];

                            if (declaration.members) {
                                methodComments.forEach(match => {
                                    const fullComment = match[1]
                                        .split('\n')
                                        .map(line => line.replace(/^\s*\*\s?/, ''))
                                        .join('\n')
                                        .trim();
                                    const methodName = match[2];

                                    const member = declaration.members.find(m => m.name === methodName);
                                    if (member) {
                                        member.description = fullComment;
                                    }
                                });
                            }

                            // Extract attribute descriptions directly from source code with position-based approach
                            if (declaration.attributes) {
                                declaration.attributes.forEach(attribute => {
                                    if (attribute.fieldName) {
                                        try {
                                            // Step 1: Find the exact line where this specific property is declared
                                            const lines = sourceContent.split('\n');
                                            let propertyLineIndex = -1;

                                            // Look for the line containing: @property...accessor propertyName
                                            for (let i = 0; i < lines.length; i++) {
                                                if (lines[i].includes('@property') &&
                                                    i + 1 < lines.length &&
                                                    lines[i + 1].includes(`accessor ${attribute.fieldName}`)) {
                                                    propertyLineIndex = i;
                                                    break;
                                                }
                                                // Also check if it's all on one line
                                                if (lines[i].includes('@property') &&
                                                    lines[i].includes(`accessor ${attribute.fieldName}`)) {
                                                    propertyLineIndex = i;
                                                    break;
                                                }
                                            }

                                            if (propertyLineIndex === -1) return;

                                            // Step 2: Look backwards from this line to find the JSDoc comment
                                            let jsdocStartLine = -1;
                                            let jsdocEndLine = -1;

                                            for (let i = propertyLineIndex - 1; i >= 0; i--) {
                                                if (lines[i].trim().endsWith('*/')) {
                                                    jsdocEndLine = i;
                                                    break;
                                                }
                                            }

                                            if (jsdocEndLine !== -1) {
                                                for (let i = jsdocEndLine; i >= 0; i--) {
                                                    if (lines[i].trim().startsWith('/**')) {
                                                        jsdocStartLine = i;
                                                        break;
                                                    }
                                                }
                                            }

                                            // Step 3: Extract the JSDoc content
                                            if (jsdocStartLine !== -1 && jsdocEndLine !== -1) {
                                                const jsdocLines = lines.slice(jsdocStartLine, jsdocEndLine + 1);
                                                const fullComment = jsdocLines
                                                    .map(line => line.replace(/^\s*\/?\*+\/?/, '').trim())
                                                    .filter(line => line !== '')
                                                    .join('\n')
                                                    .trim();

                                                if (fullComment) {
                                                    attribute.description = fullComment;
                                                }
                                            }
                                        } catch (error) {
                                            console.warn(`Error extracting description for attribute ${attribute.fieldName}:`, error.message);
                                        }
                                    }
                                });
                            }

                            // Extract and enhance event descriptions from @fires JSDoc tags
                            const firesPattern = /@fires\s+([a-zA-Z-]+)\s+-\s+([^\r\n]+)/g;
                            const firesMatches = [...sourceContent.matchAll(firesPattern)];

                            if (declaration.events && firesMatches.length > 0) {
                                firesMatches.forEach(match => {
                                    const eventName = match[1];
                                    const eventDescription = match[2];

                                    const existingEvent = declaration.events.find(e => e.name === eventName);
                                    if (existingEvent) {
                                        // Enhance with the full description from JSDoc
                                        existingEvent.description = eventDescription;
                                    }
                                });
                            }
                        });

                    } catch (error) {
                        console.warn(`Could not read source file ${module.path} for full JSDoc extraction:`, error.message);
                    }
                });
            }
        }
    ]
};

