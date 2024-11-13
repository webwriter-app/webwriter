import {sourceLocale, targetLocales} from './locale-codes.js';
import {configureLocalization} from '@lit/localize';
export default configureLocalization({sourceLocale, targetLocales, loadLocale: (locale) => import(`./${locale}.ts`)});