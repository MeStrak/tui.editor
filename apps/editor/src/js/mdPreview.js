/**
 * @fileoverview Implements markdown preview
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import on from 'tui-code-snippet/domEvent/on';
import off from 'tui-code-snippet/domEvent/off';
import addClass from 'tui-code-snippet/domUtil/addClass';
import removeClass from 'tui-code-snippet/domUtil/removeClass';
import { createRenderHTML } from '@toast-ui/toastmark';

import Preview from './preview';
import domUtils from './utils/dom';
import { getHTMLRenderConvertors } from './htmlRenderConvertors';
import { findAdjacentElementToScrollTop } from './scroll/helper';
import { removeOffsetInfoByNode } from './scroll/cache/offsetInfo';
import { isInlineNode, findClosestNode } from './utils/markdown';

/**
 * Class Markdown Preview
 * @param {HTMLElement} el - base element
 * @param {EventManager} eventManager - event manager
 * @param {Convertor} convertor - convertor
 * @param {boolean} isViewer - true for view only mode
 * @ignore
 */
class MarkdownPreview extends Preview {
  constructor(el, eventManager, convertor, options) {
    super(el, eventManager, convertor, options.isViewer);
    this.lazyRunner.registerLazyRunFunction(
      'invokeCodeBlock',
      this.invokeCodeBlockPlugins,
      this.delayCodeBlockTime,
      this
    );

    const { linkAttribute, customHTMLRenderer } = options;

    this.renderHTML = createRenderHTML({
      gfm: true,
      nodeId: true,
      convertors: getHTMLRenderConvertors(linkAttribute, customHTMLRenderer)
    });

    this._cursorNodeId = null;

    this._initEvent();
  }

  /**
   * Initialize event
   * @private
   */
  _initEvent() {
    this.eventManager.listen('contentChangedFromMarkdown', this.update.bind(this));
    // need to implement a listener function for 'previewNeedsRefresh' event
    // to support third-party plugins which requires re-executing script for every re-render

    this.eventManager.listen('cursorActivity', ({ markdownNode }) => {
      this._updateCursorNode(markdownNode);
    });

    on(this.el, 'scroll', event => {
      this.eventManager.emit('scroll', {
        source: 'preview',
        data: findAdjacentElementToScrollTop(event.target.scrollTop, this._previewContent)
      });
    });
  }

  _updateCursorNode(cursorNode) {
    if (cursorNode) {
      cursorNode = findClosestNode(cursorNode, mdNode => !isInlineNode(mdNode));
    }
    const cursorNodeId = cursorNode ? cursorNode.id : null;

    if (this._cursorNodeId === cursorNodeId) {
      return;
    }

    const oldEL = this._getElementByNodeId(this._cursorNodeId);
    const newEL = this._getElementByNodeId(cursorNodeId);

    if (oldEL) {
      removeClass(oldEL, 'highlight-node');
    }
    if (newEL) {
      addClass(newEL, 'highlight-node');
    }

    this._cursorNodeId = cursorNodeId;
  }

  _getElementByNodeId(nodeId) {
    if (!nodeId) {
      return null;
    }
    return this._previewContent.querySelector(`[data-nodeid="${nodeId}"]`);
  }

  update(changed) {
    const { nodes, removedNodeRange } = changed;
    const contentEl = this._previewContent;
    const newHtml = this.eventManager.emitReduce(
      'convertorAfterMarkdownToHtmlConverted',
      nodes.map(node => this.renderHTML(node)).join('')
    );

    if (!removedNodeRange) {
      contentEl.insertAdjacentHTML('afterbegin', newHtml);
    } else {
      const [startNodeId, endNodeId] = removedNodeRange;
      const startEl = this._getElementByNodeId(startNodeId);
      const endEl = this._getElementByNodeId(endNodeId);

      if (startEl) {
        startEl.insertAdjacentHTML('beforebegin', newHtml);
        let el = startEl;

        while (el !== endEl) {
          const nextEl = el.nextElementSibling;

          el.parentNode.removeChild(el);
          removeOffsetInfoByNode(el);
          el = nextEl;
        }
        if (el.parentNode) {
          domUtils.remove(el);
          removeOffsetInfoByNode(el);
        }
      }
    }
    this.eventManager.emit('previewRenderAfter', this);

    const codeBlockEls = this.getCodeBlockElements(nodes.map(node => node.id));

    if (codeBlockEls.length) {
      this.lazyRunner.run('invokeCodeBlock', codeBlockEls);
    }
  }

  /**
   * render
   * @param {string} html - html string to render
   * @override
   */
  render(html) {
    super.render(html);

    this.eventManager.emit('previewRenderAfter', this);
  }

  remove() {
    off(this.el, 'scroll');
    this.el = null;
  }
}

export default MarkdownPreview;
