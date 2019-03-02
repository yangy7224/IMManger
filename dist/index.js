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

    this.defaultImg = defaultImg;
    this.mode = options.mode || 'client';
    this.talkerList = [];  //聊天对象列表
    this.curTalker = {
      userName:'',
      lastMessage: {
        dialogueID: 0
      }
    };                   //当前聊天对象
    this.msgList = [];   //当前消息列表
    this.dialogueId = 0;  //当前对话Id
    this.isLoaded = false;  //IM是否初始化完成


    this.init();   //初始化函数
  }

  async init(){
    const that = this;
    if(that.mode == 'client'){
      await this.loadTalkerListData();
    }else{
      await this.loadTalkerInfo();
    }

    await this.loadNewstQuoteData();
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

        that.talkerList = rData.map(function (item, index) {
          item.headImg = that.defaultImg;
          item.isUnread = false;
          item.tag = 0;
          item.time = '14:21';
          item.isActive = true;

          return item;

        }).filter(item => Boolean(item.userID > 0 && item.userID != that.options.selfId));

        if(that.talkerList <= 0){
          return false;
        }
        that.curTalker = that.talkerList[0];
        that.curTalker.lastMessage && that.msgList.push(that.curTalker.lastMessage);
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
      }
    })

    that.isLoaded = true;
  }

  //接受信息处理
  doReceiveMessage(res){
    const that = this;
    if(!(res instanceof Array) || res.length <= 0){
      return false;
    }

    var lastMsg = res[0];

    console.log(res);
    console.log(that.curTalker);
    var fromUserID = lastMsg.fromUserID;

    if(fromUserID == that.curTalker.userID){
      that.msgList.push(lastMsg);  //新消息来自当前用户
    }

    that.talkerList.map(function (item, index) {
      if(item.userID == fromUserID && fromUserID != that.curTalker.userID){
        item.isUnread = true;    //新消息来时，在聊天列表且不是当前的聊天对象，显示新消息提醒。
      }
    })
  }

  //切换当前聊天对象
  doSwitchCurTalker(item){
    const that = this;
    that.curTalker = item;
    that.msgList = [that.curTalker.lastMessage];
    that.loadNewstQuoteData();
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

};
