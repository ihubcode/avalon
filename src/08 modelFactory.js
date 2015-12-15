//avalon最核心的方法的两个方法之一（另一个是avalon.scan），返回一个ViewModel(VM)
avalon.vmodels = {} //所有vmodel都储存在这里
var vtree = {}
var dtree = {}

var defineProperty = Object.defineProperty
var canHideOwn = true
//如果浏览器不支持ecma262v5的Object.defineProperties或者存在BUG，比如IE8
//标准浏览器使用__defineGetter__, __defineSetter__实现
try {
    defineProperty({}, "_", {
        value: "x"
    })
    var defineProperties = Object.defineProperties
} catch (e) {
    canHideOwn = false
}

avalon.define = function (definition) {
    var $id = definition.$id
    if (!$id) {
        log("warning: vm必须指定$id")
    }
    var vmodel = observeObject(definition, {
        timestamp: new Date() - 0
    }, {
        watch: true
    })

    avalon.vmodels[$id] = vmodel
    vmodel.$id = $id

    return vmodel
}

//observeArray及observeObject的包装函数
function observe(definition, old, heirloom, options) {
    if (Array.isArray(definition)) {
        return observeArray(definition, old, heirloom, options)
    } else if (avalon.isPlainObject(definition)) {
        var vm = observeObject(definition, heirloom, options)
        for (var i in old) {
            if (vm.hasOwnProperty(i)) {
                vm[i] = old[i]
            }
        }
        return vm
    } else {
        return definition
    }
}

function observeArray(array, old, heirloom, options) {
    if (old && old.splice) {
        var args = [0, old.length].concat(array)
        old.splice.apply(old, args)
        return old
    } else {
        for (var i in newProto) {
            array[i] = newProto[i]
        }

        array._ = observeObject({
            length: NaN
        }, heirloom, {
            pathname: options.pathname + ".length",
            watch: true
        })
        array._.length = array.length
        array._.$watch("length", function (a, b) {
        })

        if (W3C) {
            hideProperty(array, "$model", $modelDescriptor)
        } else {
            array.$model = toJson(array)
        }
        var arrayOptions = {
            pathname: options.pathname + "*",
            watch: true
        }
        for (var j = 0, n = array.length; j < n; j++) {
            array[j] = observe(array[j], 0, heirloom, arrayOptions)
        }

        return array
    }
}
function Component() {
}

/*
 将一个对象转换为一个VM
 它拥有如下私有属性
 $id: vm.id
 $events: 放置$watch回调与绑定对象
 $watch: 增强版$watch
 $fire: 触发$watch回调
 $active:boolean,false时防止依赖收集
 $model:返回一个纯净的JS对象
 $accessors:avalon.js独有的对象
 =============================
 $skipArray:用于指定不可监听的属性,但VM生成是没有此属性的
 
 $$skipArray与$skipArray都不能监控,
 不同点是
 $$skipArray被hasOwnProperty后返回false
 $skipArray被hasOwnProperty后返回true
 */



var $$skipArray = oneObject("$id,$watch,$fire,$events,$model," +
        "$skipArray,$active,$accessors")


function observeObject(definition, heirloom, options) {
    options = options || {}
    heirloom = heirloom || {}

    var $skipArray = {}
    if (definition.$skipArray) {//收集所有不可监听属性
        $skipArray = oneObject(definition.$skipArray)
        delete definition.$skipArray
    }
    var $computed = getComputed(definition) // 收集所有计算属性
    var $pathname = options.pathname || ""
    var $vmodel = new Component() //要返回的对象, 它在IE6-8下可能被偷龙转凤
    var $accessors = {} //用于储放所有访问器属性的定义
    var hasOwn = {}    //用于实现hasOwnProperty方法
    var simple = []    //用于储放简单类型的访问器属性的名字
    var skip = []

    for (var key in definition) {
        if ($$skipArray[key])
            continue
        var val = definition[key]
        hasOwn[key] = true
        if (!isObervable(key, val, $skipArray)) {
            simple.push(key)
            var path = $pathname ? $pathname + "." + key : key
            $accessors[key] = makeObservable(path, heirloom)
        } else {
            skip.push(key)
        }
    }

    for (var name in $computed) {
        hasOwn[key] = true
        path = $pathname ? $pathname + "." + key : key
        $accessors[key] = makeComputed(path, heirloom, key, $computed[key])
    }

    $accessors["$model"] = $modelDescriptor

    $vmodel = defineProperties($vmodel, $accessors, definition)

    function trackBy(name) {
        return hasOwn[name] === true
    }

    skip.forEach(function (name) {
        $vmodel[name] = definition[name]
    })
    simple.forEach(function (name) {
        $vmodel[name] = definition[name]
    })

    hideProperty($vmodel, "$id", "anonymous")
    hideProperty($vmodel, "$active", false)
    hideProperty($vmodel, "hasOwnProperty", trackBy)
    hideProperty($vmodel, "$accessors", $accessors)
    if (options.watch) {
        hideProperty($vmodel, "$events", {})
        hideProperty($vmodel, "$watch", function () {
            // return $watch.apply($vmodel, arguments)
        })
        hideProperty($vmodel, "$fire", function (path, a) {
            if (path.indexOf("all!") === 0) {
                var ee = path.slice(4)
                for (var i in avalon.vmodels) {
                    var v = avalon.vmodels[i]
                    v.$fire && v.$fire.apply(v, [ee, a])
                }
            } else {
                $emit.call($vmodel, path, [a])
            }
        })
        heirloom.vm = heirloom.vm || $vmodel
    }

    for (name in $computed) {
        val = $vmodel[name]
    }

    $vmodel.$active = true
    return $vmodel
}


function isComputed(val) {//speed up!
    if (val && typeof val === "object") {
        for (var i in val) {
            if (i !== "get" && i !== "set") {
                return false
            }
        }
        return  typeof val.get === "function"
    }
}

function getComputed(obj) {
    if (obj.$computed) {
        delete obj.$computed
        return obj.$computed
    }
    var $computed = {}
    for (var i in obj) {
        if (isComputed(obj[i])) {
            $computed[i] = obj[i]
            delete obj[i]
        }
    }
    return $computed
}

function makeComputed(pathname, heirloom, key, value) {
    var old = NaN, _this = {}
    return {
        get: function () {
            if (!this.configurable) {
                _this = this
            }
            return old = value.get.call(_this)
        },
        set: function (x) {
            if (typeof value.set === "function") {
                if (!this.configurable) {
                    _this = this
                }
                var older = old
                value.set.call(_this, x)
                var newer = _this[key]
                if (_this.$active && (newer !== older)) {
                    heirloom.vm.$fire(pathname, newer, older)
                }
            }
        },
        enumerable: true,
        configurable: true
    }
}

function isObervable(key, value, skipArray) {
    return key.charAt(0) === "$" ||
            skipArray[key] ||
            (typeof value === "function") ||
            (value && value.nodeName && value.nodeType > 0)
}


function makeObservable(pathname, heirloom) {
    var old = NaN, _this = {}
    return {
        get: function () {
            if (!this.configurable) {
                _this = this // 保存当前子VM的引用
            }
            if (_this.$active) {
                collectDependency(pathname, heirloom)
            }
            return old
        },
        set: function (val) {
            if (old === val)
                return
            val = observe(val, old, heirloom, {
                pathname: pathname
            })
            if (!this.configurable) {
                _this = this // 保存当前子VM的引用
            }
            if (_this.$active) {
                // console.log(heirloom)
                console.log("$fire ", pathname, _this, heirloom.vm)
                heirloom.vm.$fire(pathname, val, old)
            }
            old = val
        },
        enumerable: true,
        configurable: true
    }
}

function createProxy(before, after) {
    var accessors = {}
    var keys = {}, k
    var b = before.$accessors
    var a = after.$accessors
    //收集所有键值对及访问器属性
    for (k in before) {
        keys[k] = before[k]
        if (b[k]) {
            accessors[k] = b[k]
        }
    }
    for (k in after) {
        keys[k] = after[k]
        if (a[k]) {
            accessors[k] = a[k]
        }
    }
    var $vmodel = {}
    $vmodel = defineProperties($vmodel, accessors, keys)
    for (k in keys) {
        if (!accessors[k]) {//添加不可监控的属性
            $vmodel[k] = keys[k]
        }
    }
    $vmodel.$active = true
    return $vmodel
}

avalon.createProxy = createProxy


function toJson(val) {
    var xtype = avalon.type(val)
    if (xtype === "array") {
        var array = []
        for (var i = 0; i < val.length; i++) {
            array[i] = toJson(val[i])
        }
        return array
    } else if (xtype === "object") {
        var obj = {}
        for (i in val) {
            if (i === "__proxy__" || i === "__data__" || i === "__const__")
                continue
            if (val.hasOwnProperty(i)) {
                var value = val[i]
                obj[i] = value && value.nodeType ? value : toJson(value)
            }
        }
        return obj
    }
    return val
}

var $modelDescriptor = {
    get: function () {
        return toJson(this)
    },
    set: noop,
    enumerable: false,
    configurable: true
}

function hideProperty(host, name, value) {
    if (canHideOwn) {
        Object.defineProperty(host, name, {
            value: value,
            writable: true,
            enumerable: false,
            configurable: true
        })
    } else {
        host[name] = value
    }
}
