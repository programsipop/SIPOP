// .eleventy.js — configuração do Eleventy

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function(eleventyConfig) {

    // Fontes e PDFs de publicações mudam raramente (e quando mudam, o nome
    // do arquivo em si costuma mudar também), então continuam como
    // passthrough simples, sem fingerprint.
    eleventyConfig.addPassthroughCopy("src/assets/fonts");
    eleventyConfig.addPassthroughCopy("src/assets/publications");
    eleventyConfig.addPassthroughCopy("src/robots.txt");

    // Shortcode que lê um CSS de src/assets/css/ em build time e devolve o
    // conteúdo pra ser inlinado direto num <style> no <head>. Usado pros
    // CSS extras de página (technical-review, publications, testimonials)
    // pra eliminar a requisição <link> bloqueante extra. Como esses
    // arquivos passam a existir só inlinados no HTML, eles não entram
    // mais na cópia de assets abaixo.
    eleventyConfig.addShortcode("inlineCss", function(filename) {
        const filePath = path.join(__dirname, "src", "assets", "css", filename);
        return fs.readFileSync(filePath, "utf8");
    });

    // ---- Fingerprint de assets (imagens, JS e style.css) ----
    //
    // Problema que isso resolve: o netlify.toml marca /assets/* como
    // "immutable" com cache de 1 ano. Isso é ótimo pra performance, mas
    // significa que, se a gente troca o CONTEÚDO de um arquivo (ex: sobe
    // uma versão menor de Logo1.webp) mantendo o MESMO nome, a Cloudflare
    // (que fica na frente do site) pode continuar servindo a versão velha
    // da borda por até 1 ano, porque o header dizia "isso nunca muda".
    //
    // A solução padrão é fazer o nome do arquivo depender do conteúdo: um
    // hash do conteúdo entra no nome (Logo1.a1b2c3d4e5.webp). Se o
    // conteúdo muda, o nome muda, a URL é nova, e o cache antigo nunca é
    // reaproveitado por engano — sem precisar purgar nada manualmente.

    function hashOf(buffer) {
        return crypto.createHash("md5").update(buffer).digest("hex").slice(0, 10);
    }

    function withHash(urlPath, hash) {
        const ext = path.extname(urlPath);
        return urlPath.slice(0, -ext.length) + "." + hash + ext;
    }

    function walk(dir) {
        if (!fs.existsSync(dir)) return [];
        let files = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            files = entry.isDirectory() ? files.concat(walk(full)) : files.concat([full]);
        }
        return files;
    }

    // Preenchido em "eleventy.before" (antes dos templates renderizarem,
    // pra que o filtro `asset` já tenha os caminhos com hash disponíveis).
    let assetManifest = {};
    // Cópia física dos arquivos só acontece em "eleventy.after", quando a
    // pasta de output com certeza já existe.
    let pendingCopies = [];

    eleventyConfig.on("eleventy.before", () => {
        assetManifest = {};
        pendingCopies = [];

        const srcDir = path.join(__dirname, "src");

        // Imagens e JS: hash direto do conteúdo original, sem reescrita —
        // nenhum dos dois referencia outros assets por caminho.
        for (const dir of [path.join(srcDir, "assets", "images"), path.join(srcDir, "assets", "js")]) {
            for (const file of walk(dir)) {
                const buffer = fs.readFileSync(file);
                const urlPath = "/" + path.relative(srcDir, file).split(path.sep).join("/");
                const hashedUrl = withHash(urlPath, hashOf(buffer));
                assetManifest[urlPath] = hashedUrl;
                pendingCopies.push({ hashedUrl, sourceFile: file });
            }
        }

        // style.css: reescreve os url() de imagem (fundos do hero/about)
        // pros caminhos JÁ com hash antes de calcular o hash do próprio
        // CSS — senão o hash do CSS ficaria "desatualizado" em relação ao
        // conteúdo real que é servido.
        const styleCssFile = path.join(srcDir, "assets", "css", "style.css");
        let cssContent = fs.readFileSync(styleCssFile, "utf8");
        cssContent = cssContent.replace(/\/assets\/images\/[^\s'")]+/g, (match) => assetManifest[match] || match);
        const cssUrlPath = "/assets/css/style.css";
        const hashedCssUrl = withHash(cssUrlPath, hashOf(Buffer.from(cssContent, "utf8")));
        assetManifest[cssUrlPath] = hashedCssUrl;
        pendingCopies.push({ hashedUrl: hashedCssUrl, content: cssContent });
    });

    eleventyConfig.on("eleventy.after", ({ dir }) => {
        const outputDir = path.resolve(dir.output);
        for (const item of pendingCopies) {
            const outPath = path.join(outputDir, item.hashedUrl);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            if (item.content !== undefined) {
                fs.writeFileSync(outPath, item.content, "utf8");
            } else {
                fs.copyFileSync(item.sourceFile, outPath);
            }
        }
    });

    // Filtro Nunjucks pra usar o caminho com hash nos templates:
    // {{ "/assets/images/logo/Logo1.webp" | asset }}
    eleventyConfig.addFilter("asset", function(urlPath) {
        return assetManifest[urlPath] || urlPath;
    });

    return {
        // Templates em Nunjucks
        markdownTemplateEngine: "njk",
        htmlTemplateEngine: "njk",
        dataTemplateEngine: "njk",

        // Pastas
        dir: {
            input:    "src",
            includes: "_includes",
            output:   "_site"
        },

        // Ignora node_modules e _site no processamento
        pathPrefix: "/"
    };
};
