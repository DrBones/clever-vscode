// good selecting library by dbankier
// https://github.com/dbankier/vscode-quick-select/blob/master/src/extension.ts

import * as vscode from 'vscode';

function findOccurances(doc: vscode.TextDocument, line: number, char: string): Array<number> {
  var content = doc.lineAt(line);
  var matches = (content.text + "hack").split(char).reduce((acc, p) => {
    var len = p.length + 1;
    if (acc.length > 0) {
      len += acc[acc.length - 1];
    }
    acc.push(len);
    return acc;
  }, []);
  matches.pop();
  return matches;
}

function findNext(doc: vscode.TextDocument, line: number, char: string, start_index: number = 0, nest_char: string = undefined, nested: number = 0): vscode.Position {
  if (line === doc.lineCount) { return undefined };
  var occurances = findOccurances(doc, line, char).filter(n => n >= start_index);
  var nests = nest_char ? findOccurances(doc, line, nest_char).filter(n => n >= start_index) : [];
  var occurance_index = 0;
  var nests_index = 0;
  while ((occurance_index < occurances.length || nests_index < nests.length) && nested >= 0) {
    if (occurances[occurance_index] < nests[nests_index] || !nests[nests_index]) {
      if (nested === 0) {
        return new vscode.Position(line, occurances[occurance_index]);
      }
      nested--
      occurance_index++;
    } else if (nests[nests_index] < occurances[occurance_index] || !occurances[occurance_index]) {
      nested++;
      nests_index++;
    }
  }
  return findNext(doc, ++line, char, 0, nest_char, nested);
}

function findPrevious(doc: vscode.TextDocument, line: number, char: string, start_index?: number, nest_char: string = undefined, nested: number = 0): vscode.Position {
  if (line === -1) { return undefined };
  if (start_index === undefined) { start_index = doc.lineAt(line).text.length; }
  var occurances = findOccurances(doc, line, char).filter(n => n <= start_index);
  var nests = nest_char ? findOccurances(doc, line, nest_char).filter(n => n <= start_index) : [];
  var occurance_index = occurances.length - 1;
  var nests_index = nests.length - 1;
  while ((occurance_index > -1 || nests_index > -1) && nested >= 0) {
    if (occurances[occurance_index] > nests[nests_index] || !nests[nests_index]) {
      if (nested === 0) {
        return new vscode.Position(line, occurances[occurance_index]);
      }
      nested--
      occurance_index--;
    } else if (nests[nests_index] > occurances[occurance_index] || !occurances[occurance_index]) {
      nested++;
      nests_index--;
    }
  }
  return findPrevious(doc, --line, char, undefined, nest_char, nested);
}

function findSingleSelect(s: vscode.Selection, doc: vscode.TextDocument, char: string, outer?: boolean, multiline?: boolean) {
  let { line, character } = s.active;
  let matches = findOccurances(doc, line, char);
  let next = matches.find(a => a > character);
  let next_index = matches.indexOf(next);
  let offset = outer ? char.length : 0;
  if (matches.length > 1 && matches.length % 2 === 0) {
    // Jump inside the next matching pair
    if (next === -1) { return s }
    if (next_index % 2 !== 0) {
      next_index--;
    }
    //Automatically grow to outer selection
    if (!outer &&
      new vscode.Position(line, matches[next_index]).isEqual(s.anchor) &&
      new vscode.Position(line, matches[next_index + 1] - 1).isEqual(s.end)) {
      offset = char.length
    }
    return new vscode.Selection(
      new vscode.Position(line, matches[next_index] - offset),
      new vscode.Position(line, matches[next_index + 1] - 1 + offset)
    );
  } else if (multiline) {
    let start_pos = findPrevious(doc, line, char, character) || new vscode.Position(line, matches[next_index])
    if (!start_pos) { return s };
    let end_pos: vscode.Position = findNext(doc, start_pos.line, char, start_pos.character + 1);
    //Automatically grow to outer selection
    if (!outer &&
      start_pos.isEqual(s.anchor) &&
      new vscode.Position(end_pos.line, end_pos.character - 1).isEqual(s.end)) {
      offset = char.length
    }
    if (start_pos && end_pos) {
      start_pos = new vscode.Position(start_pos.line, start_pos.character - offset);
      end_pos = new vscode.Position(end_pos.line, end_pos.character - 1 + offset);
      return new vscode.Selection(start_pos, end_pos)
    }
  }
  return s;

}

export function selectEitherQuote(updateSelect: boolean = true) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) { return; };
  let doc = editor.document
  let sel = editor.selections
  const selectionsResult = sel.map((s: vscode.Selection) => {
    let selections = ['"', "'", "`"].map(char => findSingleSelect(s, doc, char, false, char === '`'))
      .filter(sel => sel !== s)
      .filter(sel => sel.start.isBeforeOrEqual(s.start) && sel.end.isAfterOrEqual(s.end))
      .sort((a, b) => a.start.isBefore(b.start) ? 1 : -1)
    if (selections.length > 0) {
      return selections[0]
    }
    return s;
  })

  if (updateSelect) {
    editor.selections = selectionsResult
  }

  return selectionsResult
}

interface MatchingSelectOptions { start_char: string, end_char: string, outer?: boolean }
export function matchingSelect(
  { start_char, end_char, outer = false }: MatchingSelectOptions,
  updateSelect: boolean = true
) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) { return; };
  let doc = editor.document
  let sel = editor.selections
  let success = false;
  let start_offset = outer ? start_char.length : 0;
  let end_offset = outer ? end_char.length : 0;
  const selections = sel.map(s => {
    let { line, character } = s.active;
    let starts = findOccurances(doc, line, start_char);
    // let ends = findOccurances(doc, line, end_char);
    let start = starts.find(a => a > character);
    // let end = ends.find(a => a > character);
    let start_index = starts.indexOf(start);
    // let end_index = ends.indexOf(end);
    let start_pos: vscode.Position = findPrevious(doc, line, start_char, character, end_char) || new vscode.Position(line, starts[start_index]);
    if (!start_pos) { return s };
    let end_pos: vscode.Position = findNext(doc, start_pos.line, end_char, start_pos.character + 1, start_char);
    if (start_pos && end_pos) {
      success = true;
      //Automatically grow to outer selection
      if (!outer &&
        start_pos.isEqual(s.anchor) &&
        new vscode.Position(end_pos.line, end_pos.character - 1).isEqual(s.end)) {
        start_offset = start_char.length;
        end_offset = end_char.length;
      }
      start_pos = new vscode.Position(start_pos.line, start_pos.character - start_offset);
      end_pos = new vscode.Position(end_pos.line, end_pos.character - 1 + end_offset);

      return new vscode.Selection(start_pos, end_pos)
    }
    return s;
  })
  if (updateSelect) {
    editor.selections = selections
    if (success && start_char === "<") {
      vscode.commands.executeCommand("editor.action.addSelectionToNextFindMatch")
    }
  }
  return selections
}

export function cleverSelect() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) { return; };
  // let doc = editor.document
  let sel = editor.selections
  editor.selections = sel.map((s: vscode.Selection) => {
    let selectionsBlocks = [
      { start_char: "(", end_char: ")" },
      { start_char: "[", end_char: "]" },
      { start_char: "{", end_char: "}" },
      { start_char: "<", end_char: ">" },
      { start_char: ">", end_char: "<" }
    ].map(opt => {
      const selections = matchingSelect(opt, false)
      if (selections && selections.length > 0) {
        return selections[0]
      }
      return s
    })

    const selections = [
      ...selectionsBlocks,
      ...selectEitherQuote(false)
    ].filter(sel => sel.start !== s.start)
      .filter(
        sel =>
          sel.start.isBeforeOrEqual(s.start) &&
          sel.end.isAfterOrEqual(s.end)
      )
      .sort((a, b) => a.start.isBefore(b.start) ? 1 : -1)

    if (selections && selections.length > 0) {
      const start_pos = new vscode.Position(selections[0].start.line, selections[0].start.character);
      const end_pos = new vscode.Position(selections[0].end.line, selections[0].end.character - 1);

      return new vscode.Selection(start_pos, end_pos)
      // return selections[0]
    }
    return s
  })
}