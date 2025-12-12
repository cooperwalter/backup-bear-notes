module.exports = title => {
    const MAX_BYTES = 251
    const sanitized = title.replace(/\//g, "-")

    let truncated = sanitized
    while (Buffer.byteLength(truncated, 'utf8') > MAX_BYTES) {
        truncated = truncated.slice(0, -1)
    }

    return `${truncated}.md`
}