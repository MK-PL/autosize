window.autosize = (function () {
	'use strict';

	var defaults = {
			append: '\n',
			callback: false,
			resizeDelay: 10,
			placeholder: true,
		},
		typographyStyles = [
			'fontFamily',
			'fontSize',
			'fontWeight',
			'fontStyle',
			'letterSpacing',
			'textTransform',
			'wordSpacing',
			'textIndent',
			'whiteSpace',
			'line-height'
		],
		// to keep track which textarea is being mirrored when adjust() is called.
		mirrored,
		// the mirror element, which is used to calculate what size the mirrored element should be.
		mirror = document.createElement('textarea');

	mirror.setAttribute('style', "position:absolute; top:-999px; left:0; right:auto; bottom:auto; border:0; padding: 0; box-sizing:content-box; word-wrap:break-word; height:0 !important; min-height:0 !important; overflow:hidden; transition:none; -webkit-transition:none;");
	mirror.setAttribute('data-autosize-on', true);
	mirror.tabIndex = -1;
	mirror.id = 'autosize-mirror';

	function main(ta, options) {
		if (!ta.nodeName || ta.nodeName !== 'TEXTAREA' || ta.getAttribute('data-autosize-on')) { return; }

		var maxHeight,
			minHeight,
			boxOffset = 0,
			taStyle = window.getComputedStyle(ta, null),
			hasCallback = typeof options.callback === 'function',
			originalStyles = {
				height: ta.style.height,
				overflow: ta.style.overflow,
				overflowY: ta.style.overflowY,
				wordWrap: ta.style.wordWrap,
				resize: ta.style.resize
			},
			timeout,
			width = parseFloat(taStyle.width);

		ta.setAttribute('data-autosize-on', true);

		if (taStyle.boxSizing === 'border-box') {
			boxOffset = parseFloat(taStyle.paddingTop)+parseFloat(taStyle.paddingBottom)+parseFloat(taStyle.borderTopWidth)+parseFloat(taStyle.borderBottomWidth);
		}

		minHeight = Math.max(parseFloat(taStyle.minHeight) - boxOffset, parseFloat(taStyle.height));

		ta.style.overflow = 'hidden';
		ta.style.overflowY = 'hidden';
		ta.style.wordWrap = 'break-word'; // horizontal overflow is hidden, so break-word is necessary for handling words longer than the textarea width

		if (taStyle.resize === 'vertical') {
			ta.style.resize = 'none';
		} else if (taStyle.resize === 'both') {
			ta.style.resize = 'horizontal';
		}

		// The mirror width must exactly match the textarea width, so using getBoundingClientRect because it doesn't round the sub-pixel value.
		function setWidth() {
			var style = window.getComputedStyle(ta, null);
			var width = ta.getBoundingClientRect().width;

			if (width === 0 || typeof width !== 'number') {
				width = parseFloat(style.width);
			}

			['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].forEach(function(el){
				width -= parseFloat(style[el]);
			});

			mirror.style.width = Math.max(width,0) + 'px';
		}

		function initMirror() {
			var style = window.getComputedStyle(ta, null);

			mirrored = ta;
			maxHeight = parseFloat(style.maxHeight);

			// mirror is a duplicate textarea located off-screen that
			// is automatically updated to contain the same text as the
			// original textarea.  mirror always has a height of 0.
			// This gives a cross-browser supported way getting the actual
			// height of the text, through the scrollTop property.
			typographyStyles.forEach(function(el){
				mirror.style[el] = style[el];
			});

			mirror.wrap = ta.wrap;

			setWidth();

			// Chrome-specific fix:
			// When the textarea y-overflow is hidden, Chrome doesn't reflow the text to account for the space
			// made available by removing the scrollbar. This workaround triggers the reflow for Chrome.
			if (window.chrome) {
				var width = ta.style.width;
				ta.style.width = '0px';

				// Force reflow:
				/* jshint ignore:start */
				ta.offsetWidth;
				/* jshint ignore:end */

				ta.style.width = width;
			}
		}

		// Using mainly bare JS in this function because it is going
		// to fire very often while typing, and needs to very efficient.
		function adjust() {
			var height, original;

			if (mirrored !== ta) {
				initMirror();
			} else {
				setWidth();
			}

			if (!ta.value && options.placeholder) {
				// If the textarea is empty, copy the placeholder text into 
				// the mirror control and use that for sizing so that we 
				// don't end up with placeholder getting trimmed.
				mirror.value = ta.placeholder || '';
			} else {
				mirror.value = ta.value;
			}

			mirror.value += options.append || '';
			mirror.style.overflowY = ta.style.overflowY;
			original = parseFloat(ta.style.height);

			mirror.scrollTop = 9e4;

			// Using scrollTop rather than scrollHeight because scrollHeight is non-standard and includes padding.
			height = mirror.scrollTop;

			if (maxHeight && height > maxHeight) {
				ta.style.overflowY = 'scroll';
				height = maxHeight;
			} else {
				ta.style.overflowY = 'hidden';
				if (height < minHeight) {
					height = minHeight;
				}
			}

			height += boxOffset;

			if (original !== height) {
				ta.style.height = height + 'px';
				if (hasCallback) {
					options.callback.call(ta,ta);
				}
				ta.dispatchEvent(new CustomEvent('autosize.resize'));
			}
		}

		if ('onpropertychange' in ta) {
			if ('oninput' in ta) {
				// Detects IE9.  IE9 does not fire onpropertychange or oninput for deletions,
				// so binding to onkeyup to catch most of those events.
				// There is no way that I know of to detect something like 'cut' in IE9.
				ta.addEventListener('keyup', adjust);
			}
		}

		// Modern Browsers
		ta.addEventListener('input', adjust);

		// Set options.resizeDelay to false if using fixed-width textarea elements.
		// Uses a timeout and width check to reduce the amount of times adjust needs to be called after window resize.
		function resize () {
			clearTimeout(timeout);
			timeout = setTimeout(function(){
				var newWidth = parseFloat(window.getComputedStyle(ta, null).width);

				if (newWidth !== width) {
					width = newWidth;
					adjust();
				}
			}, parseFloat(options.resizeDelay));
		}
		if (options.resizeDelay !== false) {
			window.addEventListener('resize', resize);
		}

		// Event for manual triggering that also forces the styles to update as well.
		// Should only be needed if one of typography styles of the textarea change, and the textarea is already the target of the adjust method.
		ta.addEventListener('autosize.resize', function(){
			initMirror();
			adjust();
		});

		function destroy() {
			mirrored = null;
			clearTimeout(timeout);
			window.removeEventListener('resize', resize);
			ta.removeEventListener('input', adjust);
			ta.removeEventListener('keyup', adjust); // IE9
			ta.removeEventListener('autosize.resize');
			ta.removeEventListener('autosize.destroy');

			Object.keys(originalStyles).forEach(function(key){
				ta.style[key] = originalStyles[key];
			});

			ta.removeAttribute('data-autosize-on');
		}

		ta.addEventListener('autosize.destroy', destroy);

		// Call adjust in case the textarea already contains text.
		adjust();
	}

	return function (textareas, options) {
		if (!textareas) { return; }
		
		options = options || {};

		Object.keys(defaults).forEach(function(key){
			if (options[key] === undefined) {
				options[key] = defaults[key];
			}
		});

		if (mirror.parentNode !== document.body) {
			document.body.appendChild(mirror);
		}

		// Check for IE8
		if (typeof window.getComputedStyle === 'function') {
			if (textareas.length) {
				Array.prototype.forEach.call(textareas, function(el){
					main(el, options);
				});
			} else if (textareas.nodeName) {
				main(textareas, options);
			}
		}

		return textareas;
	};
}());