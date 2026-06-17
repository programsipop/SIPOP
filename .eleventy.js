// .eleventy.js — configuração do Eleventy

module.exports = function(eleventyConfig) {

    // Copia toda a pasta de assets (css, js, imagens, pdfs) sem processar.
    // Como o input agora é "src", o Eleventy automaticamente remove o
    // prefixo "src/" no output — ou seja, src/assets/css/style.css
    // vira _site/assets/css/style.css.
    eleventyConfig.addPassthroughCopy("src/assets");

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
