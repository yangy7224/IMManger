/**
 * Created by yiyang1990 on 2019/2/27.
 */
let isMiniProgram = !Boolean(window);

// 小程序下要解除下面这个注释
let regeneratorRuntime = isMiniProgram ? require('../../../miniprogram_npm/regenerator-runtime/index.js') : '';
let request = isMiniProgram ? require('../../../utils/request.js').default : require('~/utils/request').default;

const defaultImg = isMiniProgram ? '' : require('~/static/images/icon-default-head.png');

const baseLoadingConfig = {
  isNeedLoadingShow: true
}

const api = {
  // 获取指定关联对象中的所有聊天记录，用于前台。
  GHIMGetHistoryMessagesByRelationTalker: (params) => {
    return request.get('/IM/GetHistoryMessagesByRelationTalker', isMiniProgram ? params : {
            params: params
    })
  },
  // 获取关联对象的聊天对象列表，附带最新消息（仅商城端采购商调用）
  GHIMGetTalkerMessages: (params) => {
    return request.get('/IM/GetTalkerByRelation', isMiniProgram ? params : {
            params: params
        })
  },
  // 获取关联对象用户信息（仅非采购商调用）
  GHIMGetTalkerInfo: (params) => {
    return request.get('IM/GetTalkerInfo', isMiniProgram ? params : {
      params: params
    })
  },
  // 设置消息已读
  GHIMSetMessagesReaded: (params) => {
    return request.get('/IM/SetMessagesReaded', isMiniProgram ? params : {
            params: params
        })
  },
  // 获取最新报价 /Inquiry/GetQuoteByLast
  GHInquiryGetQuoteByLast: (params) => {
    return request.get('/Inquiry/GetQuoteByLast', isMiniProgram ? params : {
      params: params,
      ...baseLoadingConfig
    })
  },

  // 创建报价单（修改也视为新建，生成一个新的报价单ID）
  GHInquiryCreateQuote: (params) => {
    return request.post('/Inquiry/CreateQuote', params, baseLoadingConfig)
  },

// 获取近3个月的“聊天对象”列表，附带最新消息。/IM/GetTalkers
  GHIMGetTalkers: (params) => {
    return request.get('/IM/GetTalkers', isMiniProgram ? params : {
            params: params
    })
  }
};

export default class IMManager{
  constructor(options){
    this.api = api;  //调用的api
    this.options = options;  //配置项

    this.defaultImg = defaultImg;  //当前默认头像
    this.mode = options.mode || 'client';
    this.talkerList = [];  //聊天对象列表
    this.curTalker = {
      userName:'',
      lastMessage: {
        dialogueID: 0
      }
    };                   //当前聊天对象
    this.msgList = [];   //当前消息列表
    this.msgCacheObj = {};   //所有的消息列表缓存，存储聊天列表对象在当前窗口产生的历史纪录.包括发送消息、接受消息。
    this.dialogueId = 0;  //当前对话Id
    this.isLoaded = false;  //IM是否初始化完成
    this.postMsgTxt = '';  //当前输入文本消息

    //获取报价后成功回调
    this.getQuoteSuccess = options.getQuoteSuccess || function () {

      }
    //获取报价后失败回调
    this.getQuoteFail = options.getQuoteFail || function () {

      }

    this.init();   //初始化函数
  }

  async init(){
    const that = this;

    if(that.mode == 'mp'){
      return false;
    }

    if(that.mode == 'client'){
      await this.loadTalkerListData();
      await this.loadNewstQuoteData(that.getQuoteSuccess, that.getQuoteFail);
    }else{
      await this.loadTalkerInfo();
    }
  }

  //接受信息处理
  async doReceiveMessage(res, callback){
    const that = this;

    console.log(res)

    if(!(res instanceof Array) || res.length <= 0){
      return false;
    }

    if(res.length > 1){
      // 大于1时，为系统把所有未读消息（包含所有人）全部推送过来
      res.map(function (item, index) {
        if(that.msgCacheObj[item.fromUserID] instanceof Array){
          if(item.relationID == that.options.relationId){
            that.msgCacheObj[item.fromUserID].push(item);
          }
        }else {
          that.msgCacheObj[item.fromUserID] = [];
        }
      })
    }else{
      // 等于1时，为把某个人的消息推送过来
      var lastMsg = res[0];

      if(lastMsg.relationID != that.options.relationId){
        return false;
      }
      // messageType为1时，为用户消息
      if(lastMsg.messageType == 1){

        var fromUserID = lastMsg.fromUserID;

        //如果这条消息是来自一个不在聊天列表当中的新对象,仅仅在采购商端
        if(this.mode == 'client'){
          if(that.talkerList.filter(item => item.userID == fromUserID).length == 0){
            that.msgCacheObj[fromUserID] = [];
            //调用获取单独对象列表，并把他插入talkerList中去
            let listData = {
              userID: lastMsg.fromUserID,
              userName: lastMsg.fromUserName,
              nickName: lastMsg.fromUserName,
              lastMessage: lastMsg,
              connectionId: null,
              avatar: lastMsg.toUserAvatarUrl
            }

            that.talkerList.push(listData);
          }
        }

        that.msgCacheObj[fromUserID].push(lastMsg);

        //新消息来自当前用户
        if(fromUserID == that.curTalker.userID){
          that.msgList = that.msgCacheObj[fromUserID];
          that.doSetMessageRead();
        }

        that.talkerList.map(function (item, index) {
          //新消息来时，在聊天列表且不是当前的聊天对象，显示新消息提醒。
          if(item.userID == fromUserID && fromUserID != that.curTalker.userID){
            item.isUnread = true;
          }
          //新消息来时，更新聊天时间。
          if(item.userID == fromUserID){
            item.time = lastMsg.createTime ? lastMsg.createTime.substr(-8, 5) : '';
          }
        })

        callback && callback('messageUser');
      }
      // messageType为21时，为系统消息
      if(lastMsg.messageType == 21){
        if(lastMsg.fromUserID == that.curTalker.userID){
          callback && callback('messageSystem');
        }
      }
    }

  }

  //发送聊天消息处理
  doSendMessage(vue, relationId){
    const that = this;

    let lastMsg = that.curTalker.lastMessage;
    var toUserID = that.curTalker.userID;

    if(isMiniProgram){
        getApp().globalData.signal.sendMessage('Inquiry', relationId, that.curTalker.userID, lastMsg ? lastMsg.dialogueID : 0, that.postMsgTxt);
    }else{
        vue.$store.commit('msgDoSendMessage', {
            type: 'Inquiry',
            relationId: relationId,
            toUserId: that.curTalker.userID,
            dialogueId: lastMsg ? lastMsg.dialogueID : 0,
            msg: that.postMsgTxt
        });
    }


    let msgBlock = {fromUserName: isMiniProgram ? wx.getStorageSync('wxid_userinfo').userName : vue.$store.getters.loginInfo.userName,
        createTime: new Date().toLocaleString(),
        content: that.postMsgTxt,
        fromUserID: that.options.selfId
    };

    that.msgCacheObj[toUserID].push(msgBlock);
    that.msgList = that.msgCacheObj[toUserID];
    that.postMsgTxt = '';
  }

  //切换当前聊天对象
  doSwitchCurTalker(item, tIndex){
    const that = this;
    that.curTalker = item;
    that.msgList = that.msgCacheObj[that.curTalker.userID];

    if(item.isUnread) {
      //点击这行，有未读消息。那么将标记设为已读。处理talkerList排序
      item.isUnread = false;

      var curIndex = tIndex;
      if (curIndex == 0) {
        return;
      }
      var cacheItem = that.talkerList[0];
      that.talkerList[0] = that.talkerList[curIndex];
      that.talkerList[curIndex] = cacheItem;
    }
    // 调用设置消息已读
    that.doSetMessageRead();
    that.loadNewstQuoteData(that.getQuoteSuccess, that.getQuoteFail);
  }

  //加载聊天对象列表(采购商获取)
  async loadTalkerListData(){
    const that = this;

    await this.api.GHIMGetTalkerMessages({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      relationUserId: that.options.selfId, //创建单者的ID。在客户端指的是本人，在供应商端指的是聊天对象。
      defaultTalkerId: that.options.defaultTalkerId
    }).then(function (res) {
        res = isMiniProgram ? res.data : res;
      if(res.isCompleted){
        let rData = res.data;
        let curIndex = 0;

        that.talkerList = rData.map(function (item, index) {
          item.headImg = that.defaultImg;
          item.isUnread = false;
          item.tag = 0;
          item.time = (item.lastMessage && item.lastMessage.createTime) ? item.lastMessage.createTime.substr(-5) : '';
          item.isActive = true;

          if(item.userID == that.options.defaultTalkerId){
            curIndex = index;
          }

          return item;

        }).filter(item => Boolean(item.userID > 0 && item.userID != that.options.selfId));

        if(that.talkerList <= 0){
          return false;
        }

        that.talkerList.map(function (item, index) {
          // if(!(that.msgCacheObj[item.userID] instanceof Array)){
          that.msgCacheObj[item.userID] = item.lastMessage ? [item.lastMessage] : [];
          // }
        })
        that.curTalker = that.talkerList[curIndex];

        // 如果有未读消息列表
        if(that.msgCacheObj[that.curTalker.userID].length > 0){
          that.msgList = that.msgCacheObj[that.curTalker.userID].concat(that.msgList); //拼接未读消息
          that.doSetMessageRead(); //设置已读
        }else{
          // 如果没有未读消息列表
          that.curTalker.lastMessage && that.msgList.push(that.curTalker.lastMessage);  //取最近一条数据
        }

      }
    });

    that.isLoaded = true;
  }

  //加载聊天对象信息（供应商获取）
  async loadTalkerInfo(){
    const that = this;

    await this.api.GHIMGetTalkerInfo({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      relationUserId: that.options.defaultTalkerId
    }).then(function (res) {
      res = isMiniProgram ? res.data : res;
      if(res.isCompleted) {
        that.curTalker = res.data;
        let lastMsg = that.curTalker.lastMessage;
        let toUserID = that.curTalker.userID;

        that.msgCacheObj[toUserID] = [];

        // 如果有未读消息列表
        if(that.msgCacheObj[toUserID].length > 0){
          that.msgList = that.msgCacheObj[toUserID].concat(that.msgList); //拼接未读消息 //拼接未读消息
          that.doSetMessageRead(); //设置已读
        }else{
          //取最新一条数据
          if(lastMsg){
            that.msgCacheObj[toUserID].push(lastMsg);
            that.msgList = that.msgCacheObj[toUserID];
          }
        }

      }
    })

    that.isLoaded = true;
  }

  //加载聊天对象的历史信息
  async loadTalkerHistoryListData(){
    const that = this;

    if(that.msgList.length <= 0){
      return false;
    }

    let lastMsg = that.curTalker.lastMessage;
    let toUserID = that.curTalker.userID;

    await that.api.GHIMGetHistoryMessagesByRelationTalker({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      dialogueId: lastMsg ? lastMsg.dialogueID : 0,
      lastMessageId: that.msgList[0].imMessageID
    }).
    then(function (res) {
        res = isMiniProgram ? res.data : res;
      if(res.isCompleted){
        let rData = res.data;

        that.msgCacheObj[toUserID] = rData.concat(that.msgCacheObj[toUserID]);
        that.msgList = that.msgCacheObj[toUserID];
      }
    });
  }

  //加载最新报价信息
  async loadNewstQuoteData(success, fail) {
    const that = this;

    let supplierUserId = (that.mode == 'client' ? that.curTalker.userID : that.options.selfId); //在客户端，供应商为对话者，取对话者ID。在供应商端，供应商为自己本人，取自己的ID

    await that.api.GHInquiryGetQuoteByLast({inquiryId: that.options.relationId, supplierUserId: supplierUserId}).then(function (res) {
        res = isMiniProgram ? res.data : res;
      if(res.isCompleted){
        success && success(res);
      }else {
        fail && fail(res);
      }
    }).catch(function (err) {
      fail && fail(err);
    })
  }

  //设置消息已读
  async doSetMessageRead(){
    const that = this;

    let lastMsg = that.curTalker.lastMessage;

    if(!lastMsg || !lastMsg.dialogueID){
      return false;
    }

    await that.api.GHIMSetMessagesReaded({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      dialogueId: lastMsg.dialogueID,
    }).
    then(function (res) {
        res = isMiniProgram ? res.data : res;
      if(res.isCompleted){
        let rData = res.data;
      }
    });
  }

};
