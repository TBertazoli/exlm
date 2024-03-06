import { decorateIcons } from '../../scripts/lib-franklin.js';
import { htmlToElement, fetchLanguagePlaceholders } from '../../scripts/scripts.js';
import { buildCard } from '../../scripts/browse-card/browse-card.js';
import { createTooltip, hideTooltipOnScroll } from '../../scripts/browse-card/browse-card-tooltip.js';
import BuildPlaceholder from '../../scripts/browse-card/browse-card-placeholder.js';

export const exlmCDNUrl = 'https://cdn.experienceleague.adobe.com';

function getMetaContent(doc, name) {
  return doc.querySelector(`meta[name="${name}"]`)?.content || '';
}

function createThumbnailURL(doc, contentType) {
  if (contentType === 'Course') {
    const courseThumbnail = getMetaContent('course-thumbnail');
    return courseThumbnail ? `${exlmCDNUrl}/thumb/${courseThumbnail.split('thumb/')[1]}` : '';
  }

  if (contentType === 'Tutorial') {
    const urlString = doc?.querySelector('iframe')?.getAttribute('src');
    const videoUrl = urlString ? new URL(urlString) : null;
    const videoId = videoUrl?.pathname?.split('/v/')[1]?.split('/')[0];
    return videoId ? `https://video.tv.adobe.com/v/${videoId}?format=jpeg` : '';
  }
  return '';
}

/**
 * Converts a string to title case.
 * @param {string} str - The input string.
 * @returns {string} The string in title case.
 */
const convertToTitleCase = (str) => (str ? str.replace(/\b\w/g, (match) => match.toUpperCase()) : '');

const domParser = new DOMParser();

/**
 * Create article card data for the given article path.
 * @param {string} articlePath
 * @param {Object} placeholders
 * @returns
 */
const getCardData = async (articlePath, placeholders) => {
  let articleURL = new URL(articlePath, window.location.origin);
  if (articleURL.pathname.startsWith('/docs/courses')) {
    articleURL = new URL(articlePath, 'https://experienceleague.adobe.com');
  }
  let response = '';
  try {
    response = await fetch(articleURL.toString());
  } catch (err) {
    return {
      id: '',
      title: '',
      description: '',
      contentType: '',
      type: '',
      badgeTitle: '',
      thumbnail: '',
      product: [],
      tags: [],
      copyLink: '',
      bookmarkLink: '',
      viewLink: '',
      viewLinkText: '',
    };
  }
  const html = await response.text();
  const doc = domParser.parseFromString(html, 'text/html');
  const fullURL = new URL(articlePath, window.location.origin).href;
  const coveoContentType = getMetaContent(doc, 'coveo-content-type');
  const solutions = getMetaContent(doc, 'solutions')
    .split(',')
    .map((s) => s.trim());
  return {
    id: getMetaContent(doc, 'id'),
    title: doc.querySelector('title').textContent.split('|')[0].trim(),
    description: getMetaContent(doc, 'description'),
    contentType: coveoContentType,
    type: coveoContentType,
    badgeTitle: coveoContentType,
    thumbnail: createThumbnailURL(doc, coveoContentType),
    product: solutions,
    tags: [],
    copyLink: fullURL,
    bookmarkLink: '',
    viewLink: fullURL,
    viewLinkText: placeholders[`browseCard${convertToTitleCase(coveoContentType)}ViewLabel`]
      ? placeholders[`browseCard${convertToTitleCase(coveoContentType)}ViewLabel`]
      : `View ${coveoContentType}`,
  };
};

/**
 * Decorate function to process and log the mapped data.
 * @param {HTMLElement} block - The block of data to process.
 */
export default async function decorate(block) {
  // Extracting elements from the block
  const [headingElement, toolTipElement, linkTextElement, ...linksContainer] = [...block.children].map(
    (row) => row.firstElementChild,
  );

  headingElement.firstElementChild?.classList.add('h2');
  block.classList.add('browse-cards-block');

  const headerDiv = htmlToElement(`
    <div class="browse-cards-block-header">
      <div class="browse-cards-block-title">
        ${headingElement.innerHTML}
      </div>
      ${linkTextElement?.outerHTML}
    </div>
  `);

  if (toolTipElement?.textContent?.trim()) {
    headerDiv
      .querySelector('h1,h2,h3,h4,h5,h6')
      ?.insertAdjacentHTML('afterend', '<div class="tooltip-placeholder"></div>');
    const tooltipElem = headerDiv.querySelector('.tooltip-placeholder');
    const tooltipConfig = {
      content: toolTipElement.textContent.trim(),
    };
    createTooltip(block, tooltipElem, tooltipConfig);
  }

  block.replaceChildren(headerDiv);

  const buildCardsShimmer = new BuildPlaceholder();
  buildCardsShimmer.add(block);
  const contentDiv = document.createElement('div');
  contentDiv.className = 'browse-cards-block-content';

  let placeholders = {};
  try {
    placeholders = await fetchLanguagePlaceholders();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error fetching placeholders:', err);
  }

  const cardLoading$ = Promise.all(
    linksContainer.map(async (linkContainer) => {
      let link = linkContainer.textContent?.trim();
      link = link.startsWith('/') ? `${window.hlx.codeBasePath}${link}` : link;
      // use the link containers parent as container for the card as it is instruented for authoring
      // eslint-disable-next-line no-param-reassign
      linkContainer = linkContainer.parentElement;
      linkContainer.innerHTML = '';
      if (link) {
        try {
          const cardData = await getCardData(link, placeholders);
          await buildCard(contentDiv, linkContainer, cardData);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err);
        }
      }
      return linkContainer;
    }),
  );

  cardLoading$.then((cards) => {
    buildCardsShimmer.remove();
    contentDiv.append(...cards);
    block.appendChild(contentDiv);
  });

  /* Hide Tooltip while scrolling the cards layout */
  hideTooltipOnScroll(contentDiv);
  decorateIcons(block);
}
