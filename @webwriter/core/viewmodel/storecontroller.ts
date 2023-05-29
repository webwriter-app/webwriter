import {ReactiveController, ReactiveControllerHost} from "lit"
import { makeAutoObservable, observe } from "mobx"
import {RootStore} from "../model"

export type StoreController = RootStore & ReactiveController
export function StoreController(store: RootStore, host: ReactiveControllerHost) {
	const subStores = RootStore.storeKeys.map(key => (store as any)[key])
	subStores.forEach(x => makeAutoObservable(x, {}, {autoBind: true, deep: true}));
	(store as any)["host"] = host;
	(store as any)["hostConnected"] = () => {
		subStores.forEach(x => observe(x, () => host.requestUpdate()))
	}
	// (store as any)["hostDisconnected"] = () => (store as any)["disposer"]()
	makeAutoObservable(store, {}, {autoBind: true})
	observe(store, () => host.requestUpdate())
	host.addController(store as StoreController)
	return store as StoreController
}