/**
 * Created by yiyang1990 on 2019/2/27.
 */
import request from '~/utils/request'

const defaultImg = require('~/static/images/icon-default-head.png');

const baseLoadingConfig = {
  isNeedLoadingShow: true
}

const api = {
  // 获取指定关联对象中的所有聊天记录，用于前台。
  GHIMGetHistoryMessagesByRelationTalker: (params) => {
    return request.get('/IM/GetHistoryMessagesByRelationTalker', {
      params: params
    })
  },
  // 获取关联对象的聊天对象列表，附带最新消息（仅商城端采购商调用）
  GHIMGetTalkerMessages: (params) => {
    return request.get('/IM/GetTalkerByRelation', {
      params: params
    })
  },
  // 获取关联对象用户信息（仅非采购商调用）
  GHIMGetTalkerInfo: (params) => {
    return request.get('IM/GetTalkerInfo', {
      params: params
    })
  },
  // 设置消息已读
  GHIMSetMessagesReaded: (params) => {
    return request.get('/IM/SetMessagesReaded', {
      params: params
    })
  },
  // 获取最新报价 /Inquiry/GetQuoteByLast
  GHInquiryGetQuoteByLast: (params) => {
    return request.get('/Inquiry/GetQuoteByLast', {
      params: params
    })
  },

  // 创建报价单（修改也视为新建，生成一个新的报价单ID）
  GHInquiryCreateQuote: (params) => {
    return request.post('/Inquiry/CreateQuote', params, baseLoadingConfig)
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
    if(that.mode == 'client'){
      await this.loadTalkerListData();
      await this.loadNewstQuoteData(that.getQuoteSuccess, that.getQuoteFail);
    }else{
      await this.loadTalkerInfo();
    }
  }

  //接受信息处理
  doReceiveMessage(res){
    const that = this;

    console.log(res)
    // messageType 0 和 1 代表什么意思？
    if(!(res instanceof Array) || res.length <= 0){
      return false;
    }

    if(res.length > 1){
      // 大于1时，为系统把所有未读消息（包含所有人）全部推送过来
      res.map(function (item, index) {
        if(that.msgCacheObj[item.fromUserID] instanceof Array){
          that.msgCacheObj[item.fromUserID].push(item);
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

      var fromUserID = lastMsg.fromUserID;

      that.msgCacheObj[fromUserID].push(lastMsg);

      //新消息来自当前用户
      if(fromUserID == that.curTalker.userID){
        that.msgList = that.msgCacheObj[fromUserID];
        that.doSetMessageRead();
      }

      that.talkerList.map(function (item, index) {
        if(item.userID == fromUserID && fromUserID != that.curTalker.userID){
          item.isUnread = true;    //新消息来时，在聊天列表且不是当前的聊天对象，显示新消息提醒。
        }
      })
    }

  }

  //发送聊天消息处理
  doSendMessage(vue, relationId){
    const that = this;

    let lastMsg = that.curTalker.lastMessage;
    var toUserID = that.curTalker.userID;

    vue.$store.commit('msgDoSendMessage', {
      type: 'Inquiry',
      relationId: relationId,
      toUserId: that.curTalker.userID,
      dialogueId: lastMsg ? lastMsg.dialogueID : 0,
      msg: that.postMsgTxt
    });

    let msgBlock = {content: that.postMsgTxt, fromUserID: that.options.selfId};

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
      if(res.isCompleted){
        let rData = res.data;
        let curIndex = 0;

        that.talkerList = rData.map(function (item, index) {
          item.headImg = that.defaultImg;
          item.isUnread = false;
          item.tag = 0;
          item.time = '14:21';
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
          if(!(that.msgCacheObj[item.userID] instanceof Array)){
            that.msgCacheObj[item.userID] = [item.lastMessage];
          }
        })
        that.curTalker = that.talkerList[curIndex];
        // that.curTalker.lastMessage && that.msgList.push(that.curTalker.lastMessage);
        if(that.curTalker.lastMessage){
          that.msgList = that.msgList.concat(that.msgCacheObj[that.curTalker.userID]);
          that.doSetMessageRead();
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
      userId: that.options.defaultTalkerId
    }).then(function (res) {
      if(res.isCompleted) {
        that.curTalker = res.data;
        that.curTalker.lastMessage && that.msgList.push(that.curTalker.lastMessage);
        that.msgCacheObj[that.curTalker.userID] = [that.curTalker.lastMessage];
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
    await that.api.GHIMGetHistoryMessagesByRelationTalker({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      dialogueId: lastMsg ? lastMsg.dialogueID : 0,
      lastMessageId: that.msgList[0].imMessageID
    }).
    then(function (res) {
      if(res.isCompleted){
        let rData = res.data;

        that.msgList = that.msgList.reverse().concat(rData).reverse();
      }
    });
  }

  //加载最新报价信息
  async loadNewstQuoteData(success, fail) {
    const that = this;

    let supplierUserId = (that.mode == 'client' ? that.curTalker.userID : that.options.selfId); //在客户端，供应商为对话者，取对话者ID。在供应商端，供应商为自己本人，取自己的ID

    await that.api.GHInquiryGetQuoteByLast({inquiryId: that.options.relationId, supplierUserId: supplierUserId}).then(function (res) {
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

    if(!lastMsg.dialogueID || !lastMsg){
      return false;
    }

    await that.api.GHIMSetMessagesReaded({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      dialogueId: lastMsg.dialogueID,
    }).
    then(function (res) {
      if(res.isCompleted){
        let rData = res.data;
      }
    });
  }

};
