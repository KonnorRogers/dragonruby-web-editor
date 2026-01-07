import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from 'https://esm.sh/@codemirror/autocomplete@^6.0.0'
import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@^6.0.0'
import { StreamLanguage, bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from 'https://esm.sh/@codemirror/language@^6.0.0'
import { lintKeymap } from 'https://esm.sh/@codemirror/lint@^6.0.0'
import { highlightSelectionMatches, searchKeymap } from 'https://esm.sh/@codemirror/search@^6.0.0'
import { EditorState } from 'https://esm.sh/@codemirror/state@^6.0.0'
import { crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from 'https://esm.sh/@codemirror/view@^6.0.0'

// For some reason, only jspm.io is able to build this package.
import { ruby } from "https://ga.jspm.io/npm:@codemirror/legacy-modes@6.5.2/mode/ruby.js"

function debounce(func, timeout = 300){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

export default class DragonRubyEditor {
  constructor ({
    editorElement,
    iframeElement,
    initialText,
    extensions = []
  }) {
    this.iframeElement = iframeElement
    this.editorElement = editorElement
    this._value = initialText

    this.sync = debounce(this.sync.bind(this), 20)
    document.addEventListener("click", this.sync)

    this.editor = new EditorView({
      parent: editorElement,
      state: EditorState.create({
        doc: this.value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            // ...lintKeymap,
          ]),
          StreamLanguage.define(ruby),
          EditorView.updateListener.of((view) => {
            if (view.docChanged) {
              const value = this.editor.state.doc.toString()
              this.value = value
            }
          }),
          ...(extensions || []),
        ],
      }),
    })
    this.sync()
  }

  get value () {
    return this._value
  }

  set value (val) {
    this._value = val
    this.sync()
  }

  sync () {
    const iframeWindow = this.iframeElement.contentWindow

    console.log(this.value)
    if (!iframeWindow.FS || !iframeWindow.gtk?.play) {
      // this.iframeElement.onload = () => {
      //   this.sync()
      // }
      setTimeout(() => this.sync(), 10)
      return
    }

    setTimeout(async () => {
      await iframeWindow.FS.writeFile('app/main.rb', this.value);
      setTimeout(() => {
        iframeWindow.gtk.play();
      })
    })
  }

  disconnect () {
    this.editor.destroy()
  }
}

const controllers = new Map()

const config = { attributes: true, childList: true, subtree: true };
// Callback function to execute when mutations are observed
const callback = (mutationList, observer) => {
  console.log("callback")
  const editors = document.querySelectorAll("[data-dragonruby-editor]")

  Object.keys(controllers).forEach((controller) => {
    if (editors.includes(controller)) { return }

    // clean up nodes that no longer exist.
    controllers.delete(controller)
    controller.disconnect()
  })


  editors.forEach((editor) => {
    if (controllers.has(editor)) {
      return
    }

    const iframe = document.querySelector(`#${editor.getAttribute("data-dragonruby-iframe")}`)
    console.log(iframe)

    let value = null
    const valueFromElement = editor.getAttribute("data-dragonruby-value-element")

    if (valueFromElement) {
      const valueElement = document.querySelector(`#${valueFromElement}`)
      if (valueFromElement) { value = dedent(valueElement.textContent.trim()) }
    }

    if (value == null) {
      value = editor.getAttribute("data-value")
    }

    // Force a reload.

    new DragonRubyEditor({
      editorElement: editor,
      iframeElement: iframe,
      initialText: value
    })

    controllers.set(editor)
  })
};

/**
 * This may be wrong, but we assume a `\t` is equivalent to 2 spaces.
 */
const TAB_LENGTH = 2;

const INDENT_REGEXP = new RegExp(`(\t| {${TAB_LENGTH}})`);

/**
 * @param {TemplateStringsArray|string} templateStrings
 * @param {any[]} values
 * @returns {string}
 */
function dedent(templateStrings, ...values) {
  let matches = [];
  let strings =
    typeof templateStrings === "string"
      ? [templateStrings]
      : templateStrings.slice();

  /**
   * @param {string[]} strings
   * @param {unknown[]} values
   */
  function interpolate(strings, values) {
    let finalString = [];
    finalString.push(strings[0]);

    for (let i = 0; i < values.length; i++) {
      finalString.push(values[i] + strings[i + 1]);
    }

    return finalString.join("\n").trim();
  }

  // 1. check if its dedentable.
  let isDedentable = true;

  // 2. Find all line breaks to determine the highest common indentation level.
  for (let i = 0; i < strings.length; i++) {
    let match;

    // If any new line starts without any indentation and not an empty string, mark it as not dedentable, and then break the loop.
    if (strings[i].match(/\n[^\f\r\n\t ]/)) {
      isDedentable = false;
      break;
    }

    if (
      (match = strings[i].match(new RegExp(`\n${INDENT_REGEXP.source}+`, "g")))
    ) {
      matches.push(...match);
    }
  }

 if (!isDedentable) {
    return interpolate(strings, values);
  }

  // 3. Remove the common indentation from all strings.
  if (matches.length) {
    let size = Math.min(...matches.map((value) => value.length - 1));
    let pattern = new RegExp(`\n(\t| ){${size}}`, "g");

    for (let i = 0; i < strings.length; i++) {
      strings[i] = strings[i].replaceAll(pattern, "\n");
    }
  }

  // 5. Perform interpolation.
  return interpolate(strings, values);
}


// Create an observer instance linked to the callback function
const observer = new MutationObserver(callback);
callback()

// Start observing the target node for configured mutations
observer.observe(document.body, config);
