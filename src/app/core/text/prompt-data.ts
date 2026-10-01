/**
 * Wraps user-supplied text in a named tag for a prompt.
 *
 * The vacancy is untrusted input that may carry instructions (cv-pipeline
 * skill): the prompt tells the model that tagged content is data, and this
 * removes any copy of the tag from the content itself, so a pasted
 * `</vacante>` cannot close the frame early and smuggle text out of it.
 */
export function tagged(tag: string, content: string): string {
  const stray = new RegExp(`</?\\s*${tag}\\s*>`, 'gi');
  return `<${tag}>\n${content.replace(stray, '').trim()}\n</${tag}>`;
}
