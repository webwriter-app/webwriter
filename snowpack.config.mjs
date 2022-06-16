export default {
    mount: {
        "./source/static/": {url: "/", static: true},
        "source/": "/",
        "./node_modules/@shoelace-style/shoelace/dist/assets/icons/": {url: "/assets/icons/", static: true},
    },
    buildOptions: {
        sourcemap: true
    },
    optimize: {
        bundle: true,
        minify: true,
        target: "es2020"
    }
}