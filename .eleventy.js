// .eleventy.js — configuração do Eleventy

const fs = require("fs");
const path = require("path");

module.exports = function(eleventyConfig) {

    // Copia toda a pasta de assets (css, js, imagens, pdfs) sem processar.
    // Como o input agora é "src", o Eleventy automaticamente remove o
    // prefixo "src/" no output — ou seja, src/assets/css/style.css
    // vira _site/assets/css/style.css.
    eleventyConfig.addPassthroughCopy("src/assets");
    eleventyConfig.addPassthroughCopy("src/robots.txt");

    // Shortcode que lê um CSS de src/assets/css/ em build time e devolve o
    // conteúdo pra ser inlinado direto num <style> no <head>. Usado pros
    // CSS extras de página (technical-review, publications, testimonials)
    // pra eliminar a requisição <link> bloqueante extra — eles são pequenos
    // (poucos KB) e só valem a pena como arquivo separado se fossem
    // reaproveitados entre muitas páginas, o que não é o caso.
    eleventyConfig.addShortcode("inlineCss", function(filename) {
        const filePath = path.join(__dirname, "src", "assets", "css", filename);
        return fs.readFileSync(filePath, "utf8");
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
